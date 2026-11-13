"""
build_workflow_06.py — Membuat n8n/06_notifikasi_stok_telegram.json.

Workflow 06 = PEMANTAU STOK. Membaca tab Stok_Live (dihitung otomatis oleh rumus dari Order_Masuk),
lalu mengirim notifikasi Telegram ke pemilik toko saat ada produk yang BARU masuk status
RESTOCK / HABIS, atau sudah AMAN lagi.

Dijalankan oleh:
  - jadwal tiap 5 menit, dan
  - webhook POST /glowra-cek-stok (dipanggil toko demo setelah order tercatat & tombol "Cek stok"
    di dashboard) supaya notifikasi terasa instan.

Anti spam: n8n mengingat status terakhir tiap produk (static data workflow). Produk yang sudah
dilaporkan RESTOCK tidak dilaporkan lagi sampai statusnya berubah. Body webhook `{"paksa": true}`
mengirim ringkasan lengkap walau tidak ada perubahan (untuk demo).

Jalankan dari folder project:
    python scripts/build_workflow_06.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "n8n" / "06_notifikasi_stok_telegram.json"

JS_BANDINGKAN = r"""
// Bandingkan status stok sekarang dengan status yang terakhir dilaporkan.
// Static data hanya tersimpan saat workflow berjalan dalam mode aktif (Publish), bukan saat tes manual.
const ingatan = $getWorkflowStaticData('global');
const lalu = ingatan.statusTerakhir || {};

let paksa = false;
try { paksa = Boolean($('Cek Sekarang (Webhook)').first().json.body?.paksa); } catch (e) { /* dipicu jadwal */ }

// Hanya baris produk (SKU GLW-...), bukan baris catatan di bawah tabel.
const baris = $input.all().map((i) => i.json).filter((r) => /^GLW-/.test(String(r.SKU || '')));
const sekarang = {};
const masalahBaru = [];
const pulih = [];
for (const r of baris) {
  const status = String(r.Status || '').trim();
  sekarang[r.SKU] = status;
  const sebelumnya = lalu[r.SKU] || 'AMAN';
  const info = { sku: r.SKU, nama: String(r['Nama Produk'] || '').replace(/^Glowra\s+/, ''), status,
                 tersedia: r['Stok Tersedia'], minimum: r['Stok Minimum'] };
  if (status !== 'AMAN' && status !== sebelumnya) masalahBaru.push(info);
  if (status === 'AMAN' && sebelumnya !== 'AMAN') pulih.push(info);
}
ingatan.statusTerakhir = sekarang;

const semuaMasalah = baris.filter((r) => r.Status && r.Status !== 'AMAN')
  .map((r) => ({ sku: r.SKU, nama: String(r['Nama Produk'] || '').replace(/^Glowra\s+/, ''), status: r.Status,
                 tersedia: r['Stok Tersedia'], minimum: r['Stok Minimum'] }));
const daftar = paksa ? semuaMasalah : masalahBaru;
const kirim = daftar.length > 0 || (!paksa && pulih.length > 0) || paksa;

const baris1 = (x) => `${x.status === 'HABIS' ? '⛔' : '⚠️'} ${x.nama} (${x.sku})\n    sisa ${x.tersedia}, minimum ${x.minimum}`;
const bagian = [];
bagian.push(paksa ? '📦 Ringkasan stok Glowra Beauty' : '📦 Peringatan stok Glowra Beauty');
if (daftar.length) bagian.push(`\nPerlu restock (${daftar.length}):\n` + daftar.map(baris1).join('\n'));
else if (paksa) bagian.push('\nSemua produk AMAN ✅');
if (!paksa && pulih.length) bagian.push(`\nSudah aman lagi ✅:\n` + pulih.map((x) => `• ${x.nama} (sisa ${x.tersedia})`).join('\n'));
bagian.push(`\nTotal produk perlu perhatian: ${semuaMasalah.length} dari ${baris.length}`);
bagian.push(`🕒 ${$now.setZone('Asia/Jakarta').toFormat('dd LLL yyyy HH:mm')} WIB`);

return [{ json: {
  kirim,
  pesan: bagian.join('\n'),
  masalah_baru: masalahBaru.map((x) => x.sku),
  pulih: pulih.map((x) => x.sku),
  perlu_perhatian: semuaMasalah,
} }];
""".strip()

JS_HASIL = r"""
// Ringkasan hasil (dikembalikan ke pemanggil webhook; untuk jadwal hanya tercatat di Executions).
const b = $('Bandingkan dengan Laporan Terakhir').first().json;
let terkirim = false;
let galat = null;
try {
  const t = $('Kirim ke Telegram').first().json;
  terkirim = Boolean(t && (t.ok || t.message_id || (t.result && t.result.message_id)));
  if (t && t.error) galat = typeof t.error === 'string' ? t.error : (t.error.message || JSON.stringify(t.error));
} catch (e) { /* cabang tanpa kirim */ }
return [{ json: {
  status: 'ok',
  notifikasi_dikirim: terkirim,
  galat_telegram: galat,
  masalah_baru: b.masalah_baru,
  pulih: b.pulih,
  perlu_perhatian: b.perlu_perhatian,
} }];
""".strip()

CATATAN = (
    "## 06 · Pemantau Stok → Telegram\n\n"
    "**Sumber:** tab `Stok_Live` (rumus otomatis dari `Order_Masuk`).\n\n"
    "**Kapan jalan:** tiap 5 menit + saat dipanggil webhook `/glowra-cek-stok` (toko demo memanggilnya "
    "setelah order tercatat).\n\n"
    "**Anti spam:** hanya lapor saat status produk BERUBAH (AMAN → RESTOCK/HABIS, atau pulih). "
    "`{\"paksa\": true}` = kirim ringkasan lengkap.\n\n"
    "**Sebelum dipakai:** kredensial Google + URL sheet, kredensial Telegram (token bot) + Chat ID. "
    "Panduan: `docs/09-stok-dan-notifikasi.md`."
)


def nid(i):
    return f"c6f0c006-0000-4000-8000-{i:012d}"


def main():
    nodes = [
        {"parameters": {"content": CATATAN, "height": 400, "width": 620, "color": 7},
         "id": nid(1), "name": "Catatan Workflow", "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-60, -520]},
        {"parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 5}]}},
         "id": nid(2), "name": "Tiap 5 Menit", "type": "n8n-nodes-base.scheduleTrigger",
         "typeVersion": 1.2, "position": [0, -100]},
        {"parameters": {"httpMethod": "POST", "path": "glowra-cek-stok", "responseMode": "lastNode",
                        "options": {}},
         "id": nid(3), "name": "Cek Sekarang (Webhook)", "type": "n8n-nodes-base.webhook",
         "typeVersion": 2, "position": [0, 100], "webhookId": "6e1b2d93-7c4a-4b8e-9f10-3a5c8d602026"},
        {"parameters": {
            "authentication": "serviceAccount",
            "operation": "read",
            "documentId": {"__rl": True, "value": "TEMPEL_URL_GOOGLE_SHEET_DI_SINI", "mode": "url"},
            "sheetName": {"__rl": True, "value": "Stok_Live", "mode": "name"},
            "options": {},
        },
         "id": nid(4), "name": "Baca Stok_Live", "type": "n8n-nodes-base.googleSheets",
         "typeVersion": 4.7, "position": [260, 0]},
        {"parameters": {"jsCode": JS_BANDINGKAN}, "id": nid(5), "name": "Bandingkan dengan Laporan Terakhir",
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [500, 0]},
        {"parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{"id": "d6000006-0000-4000-8000-000000000001", "leftValue": "={{ $json.kirim }}",
                                "rightValue": "", "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and",
            },
            "options": {},
        },
         "id": nid(6), "name": "Ada yang Perlu Dilaporkan?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [740, 0]},
        {"parameters": {
            "chatId": "TEMPEL_CHAT_ID_TELEGRAM",
            "text": "={{ $json.pesan }}",
            "additionalFields": {"appendAttribution": False},
        },
         "id": nid(7), "name": "Kirim ke Telegram", "type": "n8n-nodes-base.telegram",
         "typeVersion": 1.2, "position": [980, -100], "onError": "continueRegularOutput"},
        {"parameters": {"jsCode": JS_HASIL}, "id": nid(8), "name": "Hasil Cek",
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [1220, 0]},
    ]

    def ke(*target):
        return {"main": [[{"node": t, "type": "main", "index": 0}] for t in target]}

    connections = {
        "Tiap 5 Menit": ke("Baca Stok_Live"),
        "Cek Sekarang (Webhook)": ke("Baca Stok_Live"),
        "Baca Stok_Live": ke("Bandingkan dengan Laporan Terakhir"),
        "Bandingkan dengan Laporan Terakhir": ke("Ada yang Perlu Dilaporkan?"),
        "Ada yang Perlu Dilaporkan?": ke("Kirim ke Telegram", "Hasil Cek"),
        "Kirim ke Telegram": ke("Hasil Cek"),
    }

    wf = {
        "name": "Glowra 06 - Pemantau Stok & Notifikasi Telegram",
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
