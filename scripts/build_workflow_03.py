"""
build_workflow_03.py — Membuat n8n/03_webhook_ke_google_sheets.json.

Workflow 03 = webhook order → validasi → normalisasi → tulis ke Google Sheets (tab Order_Masuk).
Satu order boleh berisi BANYAK produk (keranjang). Setiap produk jadi 1 baris di sheet,
dengan kunci anti dobel `id_baris` = "<no_pesanan>|<sku>".

Kenapa dibuat lewat script, bukan diklik di n8n?
  Supaya workflow bisa dibuat ulang persis sama, dan kode JavaScript di dalam node bisa dibaca
  & di-diff di Git seperti kode biasa.

Jalankan dari folder project:
    python scripts/build_workflow_03.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "n8n" / "03_webhook_ke_google_sheets.json"

# Nama kolom HARUS sama persis dengan header tab Order_Masuk (scripts/build_workbook.py).
KOLOM_SHEET = ["diterima_pada_wib", "id_baris", "channel", "no_pesanan", "sku", "qty", "harga_satuan",
               "subtotal", "nama_pembeli", "no_hp_normal", "no_hp_asli", "status", "catatan"]
KOLOM_ANGKA = {"qty", "harga_satuan", "subtotal"}

# ---------------------------------------------------------------------------
JS_VALIDASI = r"""
// Validasi order yang masuk lewat webhook.
// Format baru (keranjang): { channel, no_pesanan, nama_pembeli, no_hp, items: [{ sku, qty, harga_satuan? }] }
// Format lama (1 produk) tetap diterima: { channel, no_pesanan, nama_pembeli, no_hp, sku, qty }
// Hasil: { valid: true/false, errors: [...], order: {...data asli + items...} }
const WAJIB = ['channel', 'no_pesanan', 'nama_pembeli', 'no_hp'];
const CHANNEL_DIKENAL = ['shopee', 'tiktok', 'whatsapp', 'website'];
const POLA_SKU = /^GLW-[A-Z]{3}-\d{3}$/;
const MAKS_PRODUK = 30;

return $input.all().map((item) => {
  const body = item.json.body || {};
  const kosong = (v) => v === undefined || v === null || String(v).trim() === '';
  const errors = [];

  for (const field of WAJIB) {
    if (kosong(body[field])) errors.push(`Field '${field}' wajib diisi`);
  }
  if (!kosong(body.channel) && !CHANNEL_DIKENAL.includes(String(body.channel).trim().toLowerCase())) {
    errors.push(`Field 'channel' harus salah satu dari: ${CHANNEL_DIKENAL.join(', ')}`);
  }
  if (!kosong(body.no_hp)) {
    const digit = String(body.no_hp).replace(/\D/g, '');
    if (digit.length < 9 || digit.length > 15) errors.push("Field 'no_hp' harus berisi 9-15 digit angka");
  }

  // Ambil daftar produk: format baru (items) atau format lama (sku + qty).
  let items = [];
  if (Array.isArray(body.items)) items = body.items;
  else if (!kosong(body.sku) || !kosong(body.qty)) items = [{ sku: body.sku, qty: body.qty }];

  if (items.length === 0) errors.push("Order harus berisi minimal 1 produk (field 'items', atau 'sku' + 'qty')");
  if (items.length > MAKS_PRODUK) errors.push(`Maksimal ${MAKS_PRODUK} produk per order`);

  const skuTerlihat = new Set();
  items.forEach((it, i) => {
    const label = items.length > 1 ? `Produk #${i + 1}: ` : '';
    it = it || {};
    if (kosong(it.sku)) {
      errors.push(`${label}Field 'sku' wajib diisi`);
    } else {
      const sku = String(it.sku).trim().toUpperCase();
      if (!POLA_SKU.test(sku)) errors.push(`${label}Field 'sku' harus berformat GLW-XXX-000 (contoh: GLW-SRM-001)`);
      if (skuTerlihat.has(sku)) errors.push(`${label}SKU ${sku} muncul dua kali, gabungkan qty-nya`);
      skuTerlihat.add(sku);
    }
    if (kosong(it.qty)) {
      errors.push(`${label}Field 'qty' wajib diisi`);
    } else {
      const qty = Number(it.qty);
      if (!Number.isInteger(qty) || qty <= 0) errors.push(`${label}Field 'qty' harus angka bulat lebih dari 0`);
    }
    if (!kosong(it.harga_satuan)) {
      const h = Number(it.harga_satuan);
      if (!Number.isInteger(h) || h < 0) errors.push(`${label}Field 'harga_satuan' harus angka bulat (rupiah)`);
    }
  });

  return { json: { valid: errors.length === 0, errors, order: { ...body, items } } };
});
""".strip()

JS_NORMALISASI = r"""
// Rapikan data order, lalu PECAH jadi 1 item per produk (1 item = 1 baris di sheet).
// Aturan no HP & nama sama dengan scripts/clean_merge.py supaya hasilnya konsisten.
const hasil = [];
const kosong = (v) => v === undefined || v === null || String(v).trim() === '';
const waktuWib = $now.setZone('Asia/Jakarta').toFormat('yyyy-MM-dd HH:mm:ss');

for (const item of $input.all()) {
  const o = item.json.order;

  let hp = String(o.no_hp).replace(/\D/g, '');      // buang spasi, strip, +, ( )
  if (hp.startsWith('0')) hp = '62' + hp.slice(1);  // 0812... -> 62812...
  else if (hp.startsWith('8')) hp = '62' + hp;      // 812...  -> 62812...
  const hpValid = hp.startsWith('628') && hp.length >= 11 && hp.length <= 14;

  const nama = String(o.nama_pembeli)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(kak|ka|kk)\s+/i, '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  const noPesanan = String(o.no_pesanan).trim();

  for (const it of o.items) {
    const sku = String(it.sku).trim().toUpperCase();
    const qty = Number(it.qty);
    const harga = kosong(it.harga_satuan) ? '' : Number(it.harga_satuan);
    hasil.push({
      json: {
        diterima_pada_wib: waktuWib,                 // contoh: 2026-11-13 14:05:09
        id_baris: `${noPesanan}|${sku}`,             // kunci anti dobel di sheet
        channel: String(o.channel).trim().toLowerCase(),
        no_pesanan: noPesanan,
        sku,
        qty,
        harga_satuan: harga,
        subtotal: harga === '' ? '' : harga * qty,
        nama_pembeli: nama,
        no_hp_normal: hp,
        no_hp_asli: String(o.no_hp),
        status: hpValid ? 'diterima' : 'perlu_cek',
        catatan: hpValid ? 'Order diterima dan siap diproses'
                         : 'Nomor HP bukan nomor Indonesia (628...). Mohon cek manual.',
      },
    });
  }
}
return hasil;
""".strip()

JS_RANGKUM = r"""
// Rangkum hasil penulisan ke Google Sheets jadi 1 balasan untuk pengirim.
// Node Google Sheets diset "continue on error": kalau gagal, item berisi field `error`.
const gagal = $input.all().filter((i) => i.json.error);
const baris = $('Normalisasi Data').all().map((i) => i.json);
const r = baris[0];
const semuaBerharga = baris.every((b) => b.subtotal !== '');
const perluCek = baris.some((b) => b.status === 'perlu_cek');
const tersimpan = gagal.length === 0;

let status = 'diterima';
let pesan = 'Order diterima dan sudah tercatat di Google Sheets';
if (!tersimpan) {
  status = 'gagal_simpan';
  pesan = 'Order valid, tetapi gagal ditulis ke Google Sheets. Coba kirim ulang atau cek kredensial/URL sheet.';
} else if (perluCek) {
  status = 'perlu_cek';
  pesan = 'Order tercatat, tetapi nomor HP bukan nomor Indonesia (628...). Admin perlu cek manual.';
}

let detail = null;
if (!tersimpan) {
  const e = gagal[0].json.error;
  detail = typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e);
}

return [{
  json: {
    tersimpan,
    balasan: {
      status,
      pesan,
      no_pesanan: r.no_pesanan,
      channel: r.channel,
      nama_pembeli: r.nama_pembeli,
      no_hp_normal: r.no_hp_normal,
      jumlah_produk: baris.length,
      total_qty: baris.reduce((s, b) => s + b.qty, 0),
      total: semuaBerharga ? baris.reduce((s, b) => s + b.subtotal, 0) : null,
      items: baris.map((b) => ({ sku: b.sku, qty: b.qty, harga_satuan: b.harga_satuan, subtotal: b.subtotal })),
      diterima_pada_wib: r.diterima_pada_wib,
      tersimpan_di_sheet: tersimpan,
      detail_error: detail,
    },
  },
}];
""".strip()

CATATAN = (
    "## 03 · Webhook → Google Sheets\n\n"
    "**Alur:** order masuk via **POST** → dicek → dirapikan & **dipecah per produk** → "
    "**ditulis ke tab `Order_Masuk`** → dirangkum → dibalas JSON.\n\n"
    "**Keranjang:** 1 order boleh berisi banyak produk (`items`). Tiap produk = 1 baris.\n\n"
    "**Anti dobel:** kunci `id_baris` = `no_pesanan|sku`. Kirim ulang order yang sama → baris lama "
    "**diperbarui**, tidak ditambah.\n\n"
    "**Balasan:** ✅ 200 tersimpan · ❌ 400 data salah (tidak ditulis) · ⚠️ 500 gagal tulis ke Google\n\n"
    "**Sebelum dipakai:** isi kredensial Google + URL sheet di node *Simpan ke Google Sheets*. "
    "Panduan: `docs/05-webhook-ke-google-sheets.md`."
)


def nid(i):
    return f"c3f0c003-0000-4000-8000-{i:012d}"


def kondisi_true(id_, kiri):
    return {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{
                "id": id_,
                "leftValue": kiri,
                "rightValue": "",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
            "combinator": "and",
        },
        "options": {},
    }


def balas(i, nama, kode, body, pos):
    return {
        "parameters": {"respondWith": "json", "responseBody": body, "options": {"responseCode": kode}},
        "id": nid(i), "name": nama, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1,
        "position": pos,
    }


def code(i, nama, js, pos):
    return {"parameters": {"jsCode": js}, "id": nid(i), "name": nama,
            "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}


def main():
    nodes = [
        {"parameters": {"content": CATATAN, "height": 420, "width": 640, "color": 7},
         "id": nid(1), "name": "Catatan Workflow", "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-60, -480]},
        {"parameters": {"httpMethod": "POST", "path": "glowra-order-sheets",
                        "responseMode": "responseNode", "options": {}},
         "id": nid(2), "name": "Terima Order (Webhook)", "type": "n8n-nodes-base.webhook",
         "typeVersion": 2, "position": [0, 0], "webhookId": "8b7c3f10-2e4d-4a61-b0c9-3d5e7f902026"},
        code(3, "Validasi Order", JS_VALIDASI, [240, 0]),
        {"parameters": kondisi_true("d3000003-0000-4000-8000-000000000001", "={{ $json.valid }}"),
         "id": nid(4), "name": "Data Lengkap?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [480, 0]},
        code(5, "Normalisasi Data", JS_NORMALISASI, [720, -100]),
        {
            "parameters": {
                "authentication": "serviceAccount",
                "operation": "appendOrUpdate",
                "documentId": {"__rl": True, "value": "TEMPEL_URL_GOOGLE_SHEET_DI_SINI", "mode": "url"},
                "sheetName": {"__rl": True, "value": "Order_Masuk", "mode": "name"},
                "columns": {
                    "mappingMode": "defineBelow",
                    "value": {k: f"={{{{ $json.{k} }}}}" for k in KOLOM_SHEET},
                    "matchingColumns": ["id_baris"],
                    "schema": [{
                        "id": k, "displayName": k, "required": False, "defaultMatch": False,
                        "display": True, "type": "number" if k in KOLOM_ANGKA else "string",
                        "canBeUsedToMatch": True, "removed": False,
                    } for k in KOLOM_SHEET],
                    "attemptToConvertTypes": False,
                    "convertFieldsToString": False,
                },
                # RAW = simpan apa adanya. Bawaannya USER_ENTERED: Google menebak tipe data, sehingga
                # no_pesanan TikTok 18 digit jadi angka (digit akhir rusak) & no HP 628... jadi 6,28E+11.
                "options": {"cellFormat": "RAW"},
            },
            "id": nid(6), "name": "Simpan ke Google Sheets", "type": "n8n-nodes-base.googleSheets",
            "typeVersion": 4.7, "position": [960, -100],
            # Kalau gagal, jangan berhenti diam-diam: lanjut ke "Rangkum Hasil" dengan field `error`.
            "onError": "continueRegularOutput",
            "alwaysOutputData": True,
        },
        code(7, "Rangkum Hasil", JS_RANGKUM, [1200, -100]),
        {"parameters": kondisi_true("d3000003-0000-4000-8000-000000000002", "={{ $json.tersimpan }}"),
         "id": nid(8), "name": "Tersimpan?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [1440, -100]},
        balas(9, "Balas 200 - Tersimpan", 200, "={{ $json.balasan }}", [1680, -200]),
        balas(10, "Balas 500 - Gagal Simpan", 500, "={{ $json.balasan }}", [1680, 0]),
        balas(11, "Balas 400 - Ditolak", 400,
              "={{ { status: 'ditolak', pesan: 'Data order tidak lengkap atau tidak valid', errors: $json.errors } }}",
              [720, 160]),
    ]

    def ke(*target):
        return {"main": [[{"node": t, "type": "main", "index": 0}] for t in target]}

    connections = {
        "Terima Order (Webhook)": ke("Validasi Order"),
        "Validasi Order": ke("Data Lengkap?"),
        "Data Lengkap?": ke("Normalisasi Data", "Balas 400 - Ditolak"),
        "Normalisasi Data": ke("Simpan ke Google Sheets"),
        "Simpan ke Google Sheets": ke("Rangkum Hasil"),
        "Rangkum Hasil": ke("Tersimpan?"),
        "Tersimpan?": ke("Balas 200 - Tersimpan", "Balas 500 - Gagal Simpan"),
    }

    wf = {
        "name": "Glowra 03 - Webhook Order ke Google Sheets",
        "nodes": nodes,
        "connections": connections,
        "active": False,
        "settings": {"executionOrder": "v1", "timezone": "Asia/Jakarta"},
        "pinData": {},
        "meta": {"templateCredsSetupCompleted": True},
        "tags": [],
    }
    OUT_PATH.write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Workflow tersimpan: {OUT_PATH.relative_to(ROOT)}  ({len(nodes)} node)")


if __name__ == "__main__":
    main()
