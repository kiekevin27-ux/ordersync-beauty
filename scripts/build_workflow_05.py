"""
build_workflow_05.py — Membuat n8n/05_import_export_drive.json.

Workflow 05 = IMPORT FILE EXPORT MARKETPLACE lewat Google Drive.

Cara pakai oleh seller: download file export pesanan dari Shopee Seller Centre / TikTok Seller
Center, lalu taruh (upload) ke satu folder Google Drive. n8n mengecek folder itu tiap menit:
  1. File baru terdeteksi → di-download.
  2. Dibaca (CSV atau Excel .xlsx).
  3. Platform dikenali dari nama kolom (Shopee berbahasa Indonesia, TikTok berbahasa Inggris).
  4. Dibersihkan (logika sama dengan scripts/clean_merge.py): baris dobel dibuang, SKU typo
     diperbaiki, status & tanggal diseragamkan, baris per produk dikelompokkan per order.
  5. SEMUA order dikirim sekaligus ke GERBANG ORDER (workflow 03) → 1 kali tulis ke Google Sheets.
  6. Ringkasan import dicatat ke tab Log_Import (kalau tab itu ada).

Tidak butuh izin API marketplace: cukup akses seller ke menu export (100% data asli).

Jalankan dari folder project:
    python scripts/build_workflow_05.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "n8n" / "05_import_export_drive.json"

JS_BERSIHKAN = r"""
// Kenali platform dari nama kolom, bersihkan, lalu kelompokkan per order.
// Logika sama dengan scripts/clean_merge.py. Nama kolom alternatif disiapkan untuk export asli.
const file = $('File Baru di Folder Drive').first().json;
const namaFile = file.name || '(tanpa nama)';

const KOLOM = {
  shopee: {
    no: ['No. Pesanan'], status: ['Status Pesanan'], tgl: ['Waktu Pesanan Dibuat'],
    sku: ['Nomor Referensi SKU', 'SKU Induk'], qty: ['Jumlah'],
    harga: ['Harga Setelah Diskon', 'Harga Awal'], nama: ['Nama Penerima'], hp: ['No. Telepon'],
  },
  tiktok: {
    no: ['Order ID'], status: ['Order Status'], tgl: ['Created Time'],
    sku: ['Seller SKU'], qty: ['Quantity'],
    harga: ['SKU Unit Original Price'], nama: ['Recipient'], hp: ['Phone #'],
  },
};
// null = tidak dicatat (belum dibayar)
const STATUS = {
  shopee: { 'Selesai': 'selesai', 'Sedang Dikirim': 'dikirim', 'Telah Dikirim': 'dikirim', 'Perlu Dikirim': 'diproses',
            'Sudah Dikemas': 'diproses', 'Batal': 'batal', 'Dibatalkan': 'batal', 'Pengembalian Barang/Dana': 'retur',
            'Belum Bayar': null },
  tiktok: { 'Completed': 'selesai', 'Delivered': 'dikirim', 'Shipped': 'dikirim', 'In transit': 'dikirim',
            'Awaiting Shipment': 'diproses', 'Awaiting Collection': 'diproses', 'To ship': 'diproses',
            'Cancelled': 'batal', 'Canceled': 'batal', 'Returned': 'retur', 'Unpaid': null },
};

// Rapikan nama kolom: buang BOM (﻿) & spasi di tepi.
const baris = $input.all().map((i) => {
  const r = {};
  for (const [k, v] of Object.entries(i.json)) r[String(k).replace(/^﻿/, '').trim()] = v;
  return r;
});
const gagal = (alasan) => [{ json: { ok: false, alasan: `${namaFile}: ${alasan}`, nama_file: namaFile } }];
if (baris.length === 0) return gagal('file kosong');

const header = Object.keys(baris[0]);
const platform = header.includes('No. Pesanan') ? 'shopee' : header.includes('Order ID') ? 'tiktok' : null;
if (!platform) return gagal(`bukan file export Shopee/TikTok (kolom: ${header.slice(0, 6).join(', ')}…)`);

const K = KOLOM[platform];
const ambil = (r, daftar) => {
  for (const k of daftar) if (r[k] !== undefined && String(r[k]).trim() !== '') return String(r[k]).trim();
  return '';
};
const kolomHilang = Object.entries(K).filter(([, d]) => !d.some((k) => header.includes(k))).map(([n]) => n);
if (kolomHilang.length) return gagal(`kolom wajib tidak ditemukan: ${kolomHilang.join(', ')}`);

function rapikanSku(mentah) {   // 'GLW-SRM-01' / 'glw-sns001 ' -> 'GLW-SRM-001'
  const m = mentah.replace(/\s+/g, '').toUpperCase().match(/^GLW-?([A-Z]{3})-?(\d{1,3})$/);
  return m ? `GLW-${m[1]}-${m[2].padStart(3, '0')}` : null;
}
function tanggal(mentah) {
  let m = mentah.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);              // Shopee 2026-11-11 23:02
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  m = mentah.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);                     // TikTok 12/08/2026 00:40:50
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}`;
  return '';
}
const angka = (t) => Number(String(t).replace(/[^\d.]/g, ''));

const laporan = { platform, baris_mentah: baris.length, duplikat_dibuang: 0, sku_diperbaiki: 0,
                  belum_dibayar_dilewati: 0, dilewati: [] };
const lewati = (i, no, alasan) => { if (laporan.dilewati.length < 50) laporan.dilewati.push({ baris: i + 2, no_pesanan: no, alasan }); };

const order = new Map();
const terlihat = new Set();
baris.forEach((r, i) => {
  const no = ambil(r, K.no);
  // Export TikTok asli kadang punya baris keterangan di bawah header: Order ID-nya bukan angka.
  if (!no || (platform === 'tiktok' && !/^\d+$/.test(no))) { lewati(i, no || null, 'no pesanan kosong/bukan data'); return; }

  const statusMentah = ambil(r, K.status);
  const status = STATUS[platform][statusMentah];
  if (status === null) { laporan.belum_dibayar_dilewati++; return; }
  if (status === undefined) { lewati(i, no, `status "${statusMentah}" tidak dikenal`); return; }

  const skuMentah = ambil(r, K.sku);
  const sku = rapikanSku(skuMentah);
  if (!sku) { lewati(i, no, `SKU "${skuMentah}" tidak dikenali`); return; }
  if (sku !== skuMentah) laporan.sku_diperbaiki++;

  const kunci = `${no}|${sku}`;
  if (terlihat.has(kunci)) { laporan.duplikat_dibuang++; return; }
  terlihat.add(kunci);

  const qty = angka(ambil(r, K.qty));
  const harga = Math.round(angka(ambil(r, K.harga)));
  if (!(qty > 0)) { lewati(i, no, 'jumlah tidak valid'); return; }

  if (!order.has(no)) {
    order.set(no, {
      channel: platform,
      no_pesanan: no,
      nama_pembeli: ambil(r, K.nama),
      no_hp: ambil(r, K.hp),
      status_pesanan: status,
      tanggal_pesanan: tanggal(ambil(r, K.tgl)),
      items: [],
    });
  }
  order.get(no).items.push({ sku, qty, harga_satuan: harga });
});

const orders = [...order.values()];
laporan.jumlah_order = orders.length;
laporan.jumlah_baris_produk = orders.reduce((s, o) => s + o.items.length, 0);
if (orders.length === 0) return gagal('tidak ada order yang bisa diimport');
return [{ json: { ok: true, nama_file: namaFile, laporan, payload: { orders } } }];
""".strip()

JS_RINGKASAN = r"""
// Gabungkan laporan pembersihan + balasan gerbang jadi 1 baris log.
const b = $('Kenali & Bersihkan Export').first().json;
const g = $input.first().json;           // { statusCode, body } dari gerbang
const r = g.body || {};
const waktu = $now.setZone('Asia/Jakarta').toFormat('yyyy-MM-dd HH:mm:ss');
return [{ json: {
  waktu_import: waktu,
  nama_file: b.nama_file,
  platform: b.laporan.platform,
  baris_mentah: b.laporan.baris_mentah,
  duplikat_dibuang: b.laporan.duplikat_dibuang,
  sku_diperbaiki: b.laporan.sku_diperbaiki,
  belum_dibayar_dilewati: b.laporan.belum_dibayar_dilewati,
  baris_bermasalah: b.laporan.dilewati.length,
  order_dikirim: b.laporan.jumlah_order,
  hasil_gerbang: `HTTP ${g.statusCode ?? '-'} ${r.status ?? ''}`.trim(),
  order_tercatat: r.jumlah_order ?? 0,
  baris_tercatat: r.jumlah_baris ?? 0,
  order_ditolak: r.jumlah_ditolak ?? (g.statusCode === 400 ? b.laporan.jumlah_order : 0),
  catatan: r.pesan || r.detail_error || '',
} }];
""".strip()

CATATAN = (
    "## 05 · Import File Export (Google Drive)\n\n"
    "**Seller cukup:** download export pesanan dari Shopee / TikTok Seller Center → upload ke folder "
    "Google Drive. n8n cek folder **tiap menit**.\n\n"
    "**Alur:** file baru → download → baca CSV/XLSX → kenali platform → **bersihkan** (dobel, SKU typo, "
    "status, tanggal) → kelompokkan per order → **gerbang 03** (sekali kirim) → catat ke tab `Log_Import`.\n\n"
    "**Upload ulang file yang sama aman:** baris di sheet diperbarui, tidak dobel.\n\n"
    "**Sebelum dipakai:** kredensial Google + folder Drive di node pertama (folder dibagikan ke email robot). "
    "Panduan: `docs/08-import-export-drive.md`."
)


def nid(i):
    return f"c5f0c005-0000-4000-8000-{i:012d}"


def main():
    OPSI_HTTP = {"response": {"response": {"fullResponse": True, "neverError": True}}, "timeout": 120000}
    nodes = [
        {"parameters": {"content": CATATAN, "height": 420, "width": 660, "color": 7},
         "id": nid(1), "name": "Catatan Workflow", "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-60, -500]},
        {"parameters": {
            "authentication": "serviceAccount",
            "pollTimes": {"item": [{"mode": "everyMinute"}]},
            "triggerOn": "specificFolder",
            "folderToWatch": {"__rl": True, "value": "TEMPEL_ID_FOLDER_DRIVE_DI_SINI", "mode": "id"},
            "event": "fileCreated",
            "options": {},
        },
         "id": nid(2), "name": "File Baru di Folder Drive", "type": "n8n-nodes-base.googleDriveTrigger",
         "typeVersion": 1, "position": [0, 0]},
        {"parameters": {
            "authentication": "serviceAccount",
            "operation": "download",
            "fileId": {"__rl": True, "value": "={{ $json.id }}", "mode": "id"},
            "options": {
                "binaryPropertyName": "data",
                # Kalau file-nya Google Sheets (bukan .xlsx/.csv), ubah dulu jadi .xlsx
                "googleFileConversion": {"conversion": {
                    "sheetsToFormat": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}},
            },
        },
         "id": nid(3), "name": "Download File", "type": "n8n-nodes-base.googleDrive",
         "typeVersion": 3, "position": [240, 0]},
        {"parameters": {
            "conditions": {
                "options": {"caseSensitive": False, "leftValue": "", "typeValidation": "loose"},
                "conditions": [{
                    "id": "d5000005-0000-4000-8000-000000000001",
                    "leftValue": "={{ ($('File Baru di Folder Drive').first().json.name || '').toLowerCase().endsWith('.csv') }}",
                    "rightValue": "",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }],
                "combinator": "and",
            },
            "options": {},
        },
         "id": nid(4), "name": "File CSV?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [480, 0]},
        {"parameters": {"operation": "csv", "binaryPropertyName": "data", "options": {}},
         "id": nid(5), "name": "Baca CSV", "type": "n8n-nodes-base.extractFromFile",
         "typeVersion": 1.1, "position": [720, -100]},
        {"parameters": {"operation": "xlsx", "binaryPropertyName": "data", "options": {}},
         "id": nid(6), "name": "Baca Excel", "type": "n8n-nodes-base.extractFromFile",
         "typeVersion": 1.1, "position": [720, 100]},
        {"parameters": {"jsCode": JS_BERSIHKAN}, "id": nid(7), "name": "Kenali & Bersihkan Export",
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [960, 0]},
        {"parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{"id": "d5000005-0000-4000-8000-000000000002", "leftValue": "={{ $json.ok }}",
                                "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and",
            },
            "options": {},
        },
         "id": nid(8), "name": "File Bisa Diimport?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [1200, 0]},
        {"parameters": {
            "method": "POST",
            "url": "http://localhost:5678/webhook/glowra-order-sheets",
            "sendBody": True, "specifyBody": "json",
            "jsonBody": "={{ JSON.stringify($json.payload) }}",
            "options": OPSI_HTTP,
        },
         "id": nid(9), "name": "Kirim ke Gerbang Order (workflow 03)", "type": "n8n-nodes-base.httpRequest",
         "typeVersion": 4.2, "position": [1440, -100], "onError": "continueRegularOutput", "alwaysOutputData": True},
        {"parameters": {"jsCode": JS_RINGKASAN}, "id": nid(10), "name": "Ringkasan Import",
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1680, -100]},
        {"parameters": {
            "authentication": "serviceAccount",
            "operation": "append",
            "documentId": {"__rl": True, "value": "TEMPEL_URL_GOOGLE_SHEET_DI_SINI", "mode": "url"},
            "sheetName": {"__rl": True, "value": "Log_Import", "mode": "name"},
            "columns": {"mappingMode": "autoMapInputData", "value": {}, "matchingColumns": [], "schema": [],
                        "attemptToConvertTypes": False, "convertFieldsToString": False},
            "options": {"cellFormat": "RAW", "handlingExtraData": "insertInNewColumn"},
        },
         "id": nid(11), "name": "Catat ke Log_Import", "type": "n8n-nodes-base.googleSheets",
         "typeVersion": 4.7, "position": [1920, -100], "onError": "continueRegularOutput"},
        {"parameters": {"errorMessage": "={{ $json.alasan }}"},
         "id": nid(12), "name": "Gagal: File Tidak Bisa Diimport", "type": "n8n-nodes-base.stopAndError",
         "typeVersion": 1, "position": [1440, 100]},
    ]

    def ke(*target):
        return {"main": [[{"node": t, "type": "main", "index": 0}] for t in target]}

    connections = {
        "File Baru di Folder Drive": ke("Download File"),
        "Download File": ke("File CSV?"),
        "File CSV?": ke("Baca CSV", "Baca Excel"),
        "Baca CSV": ke("Kenali & Bersihkan Export"),
        "Baca Excel": ke("Kenali & Bersihkan Export"),
        "Kenali & Bersihkan Export": ke("File Bisa Diimport?"),
        "File Bisa Diimport?": ke("Kirim ke Gerbang Order (workflow 03)", "Gagal: File Tidak Bisa Diimport"),
        "Kirim ke Gerbang Order (workflow 03)": ke("Ringkasan Import"),
        "Ringkasan Import": ke("Catat ke Log_Import"),
    }

    wf = {
        "name": "Glowra 05 - Import Export Marketplace (Google Drive)",
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
