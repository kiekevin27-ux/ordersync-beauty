"""
build_workflow_03.py — Membuat n8n/03_webhook_ke_google_sheets.json.

Workflow 03 = GERBANG ORDER. Semua order dari channel mana pun (website, WA, simulator/API
marketplace, file export) masuk lewat sini: validasi → normalisasi → tulis ke Google Sheets
(tab Order_Masuk) → balasan JSON.

- Satu order boleh berisi BANYAK produk (keranjang). Setiap produk = 1 baris di sheet.
- Kunci anti dobel: `id_baris` = "<no_pesanan>|<sku>". Order yang datang lagi (mis. status
  berubah diproses → selesai) MEMPERBARUI baris yang sama.
- Bisa menerima 1 order, atau BANYAK order sekaligus (`{ "orders": [...] }`) untuk import
  file export. Semua baris ditulis dalam satu kali panggilan ke Google (batas kuota ±60/menit).

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

# Urutan kolom tab Order_Masuk (dipakai juga oleh scripts/build_workbook.py).
# Kolom baru selalu ditambah di BELAKANG supaya sheet lama tetap cocok: node Google Sheets
# memakai mode auto-map + "insertInNewColumn", jadi header yang belum ada dibuat otomatis.
KOLOM_SHEET = ["diterima_pada_wib", "id_baris", "channel", "no_pesanan", "sku", "qty", "harga_satuan",
               "subtotal", "nama_pembeli", "no_hp_normal", "no_hp_asli", "status", "catatan",
               "status_pesanan", "tanggal_pesanan"]

# ---------------------------------------------------------------------------
JS_VALIDASI = r"""
// Validasi order yang masuk lewat webhook.
// 1 order  : { channel, no_pesanan, nama_pembeli, no_hp, items: [{ sku, qty, harga_satuan? }],
//              status_pesanan?, tanggal_pesanan? }
// Banyak   : { orders: [ {...order...}, {...order...} ] }   (untuk import file export)
// Format lama 1 produk tetap diterima: { ..., sku, qty } tanpa items.
// Hasil: 1 item per order VALID ({ valid: true, order, batch, ditolak }),
//        atau 1 item { valid: false, errors, ditolak } kalau tidak ada satu pun yang valid.
const WAJIB = ['channel', 'no_pesanan', 'nama_pembeli'];
const CHANNEL_DIKENAL = ['shopee', 'tiktok', 'whatsapp', 'website'];
const CHANNEL_MARKETPLACE = ['shopee', 'tiktok'];   // API marketplace sering menyamarkan no HP
const STATUS_PESANAN = ['baru', 'diproses', 'dikirim', 'selesai', 'batal', 'retur'];
const POLA_SKU = /^GLW-[A-Z]{3}-\d{3}$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
const MAKS_PRODUK = 30;
const MAKS_ORDER = 2000;
const kosong = (v) => v === undefined || v === null || String(v).trim() === '';

function cekOrder(body) {
  const errors = [];
  for (const field of WAJIB) {
    if (kosong(body[field])) errors.push(`Field '${field}' wajib diisi`);
  }
  const channel = kosong(body.channel) ? '' : String(body.channel).trim().toLowerCase();
  if (channel && !CHANNEL_DIKENAL.includes(channel)) {
    errors.push(`Field 'channel' harus salah satu dari: ${CHANNEL_DIKENAL.join(', ')}`);
  }
  const marketplace = CHANNEL_MARKETPLACE.includes(channel);

  // No HP: wajib untuk website/WA. Untuk Shopee/TikTok boleh kosong atau disamarkan (ada '*').
  if (kosong(body.no_hp)) {
    if (!marketplace) errors.push("Field 'no_hp' wajib diisi");
  } else if (String(body.no_hp).includes('*')) {
    if (!marketplace) errors.push("Field 'no_hp' tidak boleh disamarkan untuk channel ini");
  } else {
    const digit = String(body.no_hp).replace(/\D/g, '');
    if (digit.length < 9 || digit.length > 15) errors.push("Field 'no_hp' harus berisi 9-15 digit angka");
  }

  if (!kosong(body.status_pesanan) && !STATUS_PESANAN.includes(String(body.status_pesanan).trim().toLowerCase())) {
    errors.push(`Field 'status_pesanan' harus salah satu dari: ${STATUS_PESANAN.join(', ')}`);
  }
  if (!kosong(body.tanggal_pesanan) && !POLA_TANGGAL.test(String(body.tanggal_pesanan).trim())) {
    errors.push("Field 'tanggal_pesanan' harus berformat YYYY-MM-DD atau YYYY-MM-DD HH:mm");
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

  return { errors, order: { ...body, items } };
}

const body = $input.first().json.body || {};
const batch = Array.isArray(body.orders);
const daftar = batch ? body.orders : [body];

if (batch && (daftar.length === 0 || daftar.length > MAKS_ORDER)) {
  const pesan = daftar.length === 0 ? "Field 'orders' tidak boleh kosong" : `Maksimal ${MAKS_ORDER} order per kiriman`;
  return [{ json: { valid: false, batch, errors: [pesan], ditolak: [] } }];
}

const valid = [];
const ditolak = [];
const noTerlihat = new Set();
daftar.forEach((o, i) => {
  const { errors, order } = cekOrder(o || {});
  const no = kosong(o && o.no_pesanan) ? null : String(o.no_pesanan).trim();
  if (no && noTerlihat.has(no)) errors.push(`no_pesanan ${no} muncul dua kali dalam kiriman ini, gabungkan produknya`);
  if (no) noTerlihat.add(no);
  if (errors.length) ditolak.push({ urutan: i + 1, no_pesanan: no, errors });
  else valid.push(order);
});

if (valid.length === 0) {
  const errors = batch
    ? ditolak.slice(0, 20).flatMap((d) => d.errors.map((e) => `Order #${d.urutan}${d.no_pesanan ? ` (${d.no_pesanan})` : ''}: ${e}`))
    : ditolak[0].errors;
  return [{ json: { valid: false, batch, errors, ditolak: ditolak.slice(0, 100) } }];
}
return valid.map((order) => ({ json: { valid: true, batch, order, ditolak: ditolak.slice(0, 100) } }));
""".strip()

JS_NORMALISASI = r"""
// Rapikan data order, lalu PECAH jadi 1 item per produk (1 item = 1 baris di sheet).
// Aturan no HP & nama sama dengan scripts/clean_merge.py supaya hasilnya konsisten.
// PENTING: field yang dikeluarkan node ini = kolom sheet (mode auto-map).
const hasil = [];
const kosong = (v) => v === undefined || v === null || String(v).trim() === '';
const waktuWib = $now.setZone('Asia/Jakarta').toFormat('yyyy-MM-dd HH:mm:ss');

for (const item of $input.all()) {
  const o = item.json.order;

  // --- No HP ---
  const hpAsli = kosong(o.no_hp) ? '' : String(o.no_hp);
  const disamarkan = hpAsli === '' || hpAsli.includes('*');   // hanya lolos validasi untuk Shopee/TikTok
  let hp = '';
  let hpValid = false;
  if (!disamarkan) {
    hp = hpAsli.replace(/\D/g, '');                    // buang spasi, strip, +, ( )
    if (hp.startsWith('0')) hp = '62' + hp.slice(1);   // 0812... -> 62812...
    else if (hp.startsWith('8')) hp = '62' + hp;       // 812...  -> 62812...
    hpValid = hp.startsWith('628') && hp.length >= 11 && hp.length <= 14;
  }

  let status = 'diterima';
  let catatan = 'Order diterima dan siap diproses';
  if (disamarkan) {
    catatan = 'No HP tidak tersedia/disamarkan oleh marketplace (normal untuk data API)';
  } else if (!hpValid) {
    status = 'perlu_cek';
    catatan = 'Nomor HP bukan nomor Indonesia (628...). Mohon cek manual.';
  }

  // --- Nama ---
  const nama = String(o.nama_pembeli)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(kak|ka|kk)\s+/i, '')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());

  const noPesanan = String(o.no_pesanan).trim();
  const statusPesanan = kosong(o.status_pesanan) ? 'baru' : String(o.status_pesanan).trim().toLowerCase();
  const tanggalPesanan = kosong(o.tanggal_pesanan) ? waktuWib.slice(0, 16) : String(o.tanggal_pesanan).trim();

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
        no_hp_asli: hpAsli,
        status,                                      // status DATA: diterima / perlu_cek
        catatan,
        status_pesanan: statusPesanan,               // status ORDER: baru / diproses / dikirim / selesai / batal / retur
        tanggal_pesanan: tanggalPesanan,
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
const v = $('Validasi Order').first().json;
const ditolak = v.ditolak || [];
const tersimpan = gagal.length === 0;
const angka = (x) => (typeof x === 'number' ? x : 0);

let detail = null;
if (!tersimpan) {
  const e = gagal[0].json.error;
  detail = typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e);
}
const PESAN_GAGAL = 'Order valid, tetapi gagal ditulis ke Google Sheets. Coba kirim ulang atau cek kredensial/URL sheet.';

if (v.batch) {
  // ---- Banyak order sekaligus (import file export) ----
  const jumlahOrder = new Set(baris.map((b) => b.no_pesanan)).size;
  let status = 'diterima';
  let pesan = `${jumlahOrder} order (${baris.length} baris) tercatat di Google Sheets`;
  if (!tersimpan) { status = 'gagal_simpan'; pesan = PESAN_GAGAL; }
  else if (ditolak.length) { status = 'diterima_sebagian'; pesan += `, ${ditolak.length} order ditolak`; }
  return [{ json: { tersimpan, balasan: {
    status, pesan, mode: 'batch',
    jumlah_order: jumlahOrder,
    jumlah_baris: baris.length,
    jumlah_ditolak: ditolak.length,
    ditolak,
    total: baris.reduce((s, b) => s + angka(b.subtotal), 0),
    diterima_pada_wib: baris[0].diterima_pada_wib,
    tersimpan_di_sheet: tersimpan,
    detail_error: detail,
  } } }];
}

// ---- 1 order ----
const r = baris[0];
const semuaBerharga = baris.every((b) => b.subtotal !== '');
const perluCek = baris.some((b) => b.status === 'perlu_cek');
let status = 'diterima';
let pesan = 'Order diterima dan sudah tercatat di Google Sheets';
if (!tersimpan) {
  status = 'gagal_simpan';
  pesan = PESAN_GAGAL;
} else if (perluCek) {
  status = 'perlu_cek';
  pesan = 'Order tercatat, tetapi nomor HP bukan nomor Indonesia (628...). Admin perlu cek manual.';
}

return [{ json: { tersimpan, balasan: {
  status,
  pesan,
  no_pesanan: r.no_pesanan,
  channel: r.channel,
  nama_pembeli: r.nama_pembeli,
  no_hp_normal: r.no_hp_normal,
  status_pesanan: r.status_pesanan,
  tanggal_pesanan: r.tanggal_pesanan,
  jumlah_produk: baris.length,
  total_qty: baris.reduce((s, b) => s + b.qty, 0),
  total: semuaBerharga ? baris.reduce((s, b) => s + b.subtotal, 0) : null,
  items: baris.map((b) => ({ sku: b.sku, qty: b.qty, harga_satuan: b.harga_satuan, subtotal: b.subtotal })),
  diterima_pada_wib: r.diterima_pada_wib,
  tersimpan_di_sheet: tersimpan,
  detail_error: detail,
} } }];
""".strip()

CATATAN = (
    "## 03 · Gerbang Order → Google Sheets\n\n"
    "**Semua channel masuk lewat sini:** toko demo, WA, simulator/API marketplace (wf 04), "
    "import file export (wf 05).\n\n"
    "**Alur:** POST → validasi → rapikan & **pecah per produk** → **tulis ke tab `Order_Masuk`** → "
    "rangkum → balas JSON.\n\n"
    "**Anti dobel:** kunci `id_baris` = `no_pesanan|sku`. Order yang datang lagi (mis. status berubah) "
    "**memperbarui** baris yang sama.\n\n"
    "**Banyak order sekaligus:** kirim `{ \"orders\": [...] }`, semua ditulis dalam 1 panggilan ke Google.\n\n"
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
        {"parameters": {"content": CATATAN, "height": 480, "width": 660, "color": 7},
         "id": nid(1), "name": "Catatan Workflow", "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-60, -540]},
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
                # Auto-map: field dari node "Normalisasi Data" = nama kolom. Kolom yang belum ada di
                # sheet otomatis ditambahkan di ujung header (aman saat kolom baru ditambah).
                "columns": {
                    "mappingMode": "autoMapInputData",
                    "value": {},
                    "matchingColumns": ["id_baris"],
                    "schema": [],
                    "attemptToConvertTypes": False,
                    "convertFieldsToString": False,
                },
                # RAW = simpan apa adanya. Bawaannya USER_ENTERED: Google menebak tipe data, sehingga
                # no_pesanan TikTok 18 digit jadi angka (digit akhir rusak) & no HP 628... jadi 6,28E+11.
                "options": {"cellFormat": "RAW", "handlingExtraData": "insertInNewColumn"},
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
              "={{ { status: 'ditolak', pesan: 'Data order tidak lengkap atau tidak valid', errors: $json.errors, ditolak: $json.ditolak } }}",
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
