"""
build_workflow_04.py — Membuat n8n/04_webhook_marketplace.json.

Workflow 04 = PENERIMA NOTIFIKASI MARKETPLACE (Shopee & TikTok Shop).

Pola ini meniru cara kerja API resmi marketplace:
  1. Marketplace mengirim notifikasi singkat (push/webhook): "order X statusnya jadi Y".
     Isinya TIDAK lengkap (tanpa produk, tanpa data pembeli).
  2. Kita mengambil DETAIL order ke API marketplace (Get Order Detail).
  3. Detail diterjemahkan ke format standar Glowra.
  4. Diteruskan ke GERBANG ORDER (workflow 03): validasi + tulis ke Google Sheets.
  5. Membalas marketplace. Balasan non-200 membuat marketplace mencoba mengirim ulang nanti,
     jadi 500 hanya dipakai kalau memang perlu diulang (gagal ambil detail / gagal tulis sheet).

Di demo ini, "API marketplace" = API tiruan di toko demo (web/app/api/mock/...), diisi dari
halaman Simulator. Untuk API asli: ganti alamat di node "Kenali Notifikasi" (PENGATURAN), lalu
tambahkan tanda tangan (signature) & access token sesuai dokumentasi Shopee Open Platform /
TikTok Shop Partner Center.

Jalankan dari folder project:
    python scripts/build_workflow_04.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "n8n" / "04_webhook_marketplace.json"

JS_KENALI = r"""
// ===== PENGATURAN =====================================================================
// Demo: API tiruan di toko demo. API asli (perlu token & signature):
//   Shopee : https://partner.shopeemobile.com/api/v2/order/get_order_detail
//   TikTok : https://open-api.tiktokglobalshop.com/order/202309/orders
const PENGATURAN = {
  api_detail_shopee: 'http://localhost:3000/api/mock/shopee/order-detail',
  api_detail_tiktok: 'http://localhost:3000/api/mock/tiktok/orders',
  gerbang_order: 'http://localhost:5678/webhook/glowra-order-sheets',   // workflow 03
};
// =====================================================================================

// Status marketplace -> status pesanan Glowra. null = belum dicatat (belum dibayar / ditahan).
const STATUS_SHOPEE = {
  UNPAID: null, READY_TO_SHIP: 'diproses', PROCESSED: 'diproses', RETRY_SHIP: 'diproses',
  SHIPPED: 'dikirim', TO_CONFIRM_RECEIVE: 'dikirim', COMPLETED: 'selesai',
  IN_CANCEL: 'batal', CANCELLED: 'batal', TO_RETURN: 'retur',
};
const STATUS_TIKTOK = {
  UNPAID: null, ON_HOLD: null, AWAITING_SHIPMENT: 'diproses', AWAITING_COLLECTION: 'diproses',
  PARTIALLY_SHIPPING: 'diproses', IN_TRANSIT: 'dikirim', DELIVERED: 'dikirim', COMPLETED: 'selesai',
  CANCELLED: 'batal',
};

const b = $input.first().json.body || {};
let n = { dikenal: false, proses: false, platform: null, order_id: null, status_mentah: null,
          status_pesanan: null, url_detail: null, gerbang_order: PENGATURAN.gerbang_order,
          alasan: 'Format notifikasi tidak dikenali (bukan notifikasi order Shopee/TikTok)' };

if (b.data && b.data.ordersn && b.shop_id !== undefined) {
  // Shopee push "order status update": { code, shop_id, timestamp, data: { ordersn, status, update_time } }
  n = { ...n, dikenal: true, platform: 'shopee', order_id: String(b.data.ordersn), status_mentah: String(b.data.status || ''),
        url_detail: `${PENGATURAN.api_detail_shopee}?order_sn_list=${encodeURIComponent(b.data.ordersn)}` };
  n.status_pesanan = STATUS_SHOPEE[n.status_mentah];
} else if (b.data && b.data.order_id && b.type !== undefined) {
  // TikTok Shop webhook "order status change": { type, shop_id, timestamp, data: { order_id, order_status, update_time } }
  n = { ...n, dikenal: true, platform: 'tiktok', order_id: String(b.data.order_id), status_mentah: String(b.data.order_status || ''),
        url_detail: `${PENGATURAN.api_detail_tiktok}?ids=${encodeURIComponent(b.data.order_id)}` };
  n.status_pesanan = STATUS_TIKTOK[n.status_mentah];
}

if (n.dikenal) {
  if (n.status_pesanan === undefined) {
    n.status_pesanan = null;
    n.alasan = `Status ${n.status_mentah} belum dipetakan, notifikasi diabaikan`;
  } else if (n.status_pesanan === null) {
    n.alasan = `Status ${n.status_mentah}: order belum dibayar/ditahan, belum dicatat`;
  } else {
    n.proses = true;
    n.alasan = null;
  }
}
return [{ json: n }];
""".strip()

JS_TERJEMAH = r"""
// Terjemahkan detail order dari API marketplace -> format standar Glowra (workflow 03).
const n = $('Kenali Notifikasi').first().json;
const res = $input.first().json;   // HTTP Request dengan "full response": { body, statusCode, headers }
const gagal = (alasan) => [{ json: { ok: false, alasan, platform: n.platform, order_id: n.order_id } }];

if (res.error || res.statusCode !== 200) {
  return gagal(`Gagal mengambil detail order dari API ${n.platform} (HTTP ${res.statusCode ?? 'tanpa balasan'})`);
}
const body = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
const wib = (detik) => DateTime.fromSeconds(Number(detik), { zone: 'Asia/Jakarta' }).toFormat('yyyy-MM-dd HH:mm');

// Gabungkan produk yang SKU-nya sama (TikTok: 1 line item = 1 unit barang).
function gabung(baris) {
  const peta = new Map();
  for (const x of baris) {
    const ada = peta.get(x.sku);
    if (ada) ada.qty += x.qty;
    else peta.set(x.sku, { ...x });
  }
  return [...peta.values()];
}

let order;
if (n.platform === 'shopee') {
  const o = body?.response?.order_list?.[0];
  if (!o) return gagal(`Order ${n.order_id} tidak ditemukan di API Shopee`);
  order = {
    channel: 'shopee',
    no_pesanan: o.order_sn,
    nama_pembeli: o.recipient_address?.name || o.buyer_username || '',
    no_hp: o.recipient_address?.phone || '',
    status_pesanan: n.status_pesanan,
    tanggal_pesanan: wib(o.create_time),
    items: gabung((o.item_list || []).map((it) => ({
      sku: it.model_sku || it.item_sku,
      qty: Number(it.model_quantity_purchased),
      harga_satuan: Math.round(Number(it.model_discounted_price)),
    }))),
  };
} else {
  const o = body?.data?.orders?.[0];
  if (!o) return gagal(`Order ${n.order_id} tidak ditemukan di API TikTok`);
  order = {
    channel: 'tiktok',
    no_pesanan: o.id,
    nama_pembeli: o.recipient_address?.name || '',
    no_hp: o.recipient_address?.phone_number || '',
    status_pesanan: n.status_pesanan,
    tanggal_pesanan: wib(o.create_time),
    items: gabung((o.line_items || []).map((li) => ({
      sku: li.seller_sku,
      qty: 1,
      harga_satuan: Math.round(Number(li.sale_price)),
    }))),
  };
}
return [{ json: { ok: true, order } }];
""".strip()

JS_BALASAN = r"""
// Siapkan balasan untuk marketplace berdasarkan hasil gerbang (workflow 03).
const n = $('Kenali Notifikasi').first().json;
const t = $('Terjemahkan ke Format Glowra').first().json;
const g = $input.first().json;   // { statusCode, body } dari gerbang
const kode = g.statusCode;

let status = 'tercatat';
let balas = 200;
if (kode === 400) status = 'ditolak_gerbang';           // data rusak: kirim ulang tidak akan membantu -> tetap 200
else if (kode !== 200) { status = 'gagal_simpan'; balas = 500; }   // minta marketplace mengulang

return [{ json: { kode_balas: balas, balasan: {
  status,
  platform: n.platform,
  order_id: n.order_id,
  status_marketplace: n.status_mentah,
  status_pesanan: n.status_pesanan,
  order_diterjemahkan: t.order,
  gerbang: { http_status: kode ?? null, balasan: g.body ?? null },
} } }];
""".strip()

CATATAN = (
    "## 04 · Notifikasi Marketplace (Shopee & TikTok)\n\n"
    "**Pola API asli:** marketplace kirim notifikasi singkat → kita **ambil detail order** ke API → "
    "**terjemahkan** ke format Glowra → teruskan ke **gerbang (workflow 03)** → balas marketplace.\n\n"
    "**Status:** belum bayar = diabaikan · siap kirim = diproses · dikirim · selesai · batal. "
    "Notifikasi berikutnya untuk order yang sama **memperbarui** baris di sheet.\n\n"
    "**Demo:** API detail = API tiruan di toko demo (`/simulator`). Untuk API asli, ubah alamat di "
    "node *Kenali Notifikasi* + tambah token & signature.\n\n"
    "Panduan: `docs/07-simulator-marketplace.md`."
)


def nid(i):
    return f"c4f0c004-0000-4000-8000-{i:012d}"


def kondisi_true(id_, kiri):
    return {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
            "conditions": [{"id": id_, "leftValue": kiri, "rightValue": "",
                            "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and",
        },
        "options": {},
    }


def code(i, nama, js, pos):
    return {"parameters": {"jsCode": js}, "id": nid(i), "name": nama,
            "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}


def http(i, nama, pos, **p):
    return {"parameters": p, "id": nid(i), "name": nama, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueRegularOutput", "alwaysOutputData": True}


OPSI_HTTP = {"response": {"response": {"fullResponse": True, "neverError": True}}, "timeout": 20000}


def main():
    nodes = [
        {"parameters": {"content": CATATAN, "height": 380, "width": 640, "color": 7},
         "id": nid(1), "name": "Catatan Workflow", "type": "n8n-nodes-base.stickyNote",
         "typeVersion": 1, "position": [-60, -460]},
        {"parameters": {"httpMethod": "POST", "path": "glowra-marketplace",
                        "responseMode": "responseNode", "options": {}},
         "id": nid(2), "name": "Terima Notifikasi (Webhook)", "type": "n8n-nodes-base.webhook",
         "typeVersion": 2, "position": [0, 0], "webhookId": "4d2a9c71-1b8e-4f53-a6d0-5e9b7c402026"},
        code(3, "Kenali Notifikasi", JS_KENALI, [240, 0]),
        {"parameters": kondisi_true("d4000004-0000-4000-8000-000000000001", "={{ $json.proses }}"),
         "id": nid(4), "name": "Perlu Dicatat?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [480, 0]},
        http(5, "Ambil Detail Order (API Marketplace)", [720, -100],
             method="GET", url="={{ $json.url_detail }}", options=OPSI_HTTP),
        code(6, "Terjemahkan ke Format Glowra", JS_TERJEMAH, [960, -100]),
        {"parameters": kondisi_true("d4000004-0000-4000-8000-000000000002", "={{ $json.ok }}"),
         "id": nid(7), "name": "Detail Didapat?", "type": "n8n-nodes-base.if", "typeVersion": 2,
         "position": [1200, -100]},
        http(8, "Kirim ke Gerbang Order (workflow 03)", [1440, -200],
             method="POST", url="={{ $('Kenali Notifikasi').first().json.gerbang_order }}",
             sendBody=True, specifyBody="json", jsonBody="={{ JSON.stringify($json.order) }}",
             options=OPSI_HTTP),
        code(9, "Siapkan Balasan", JS_BALASAN, [1680, -200]),
        {"parameters": {"respondWith": "json", "responseBody": "={{ $json.balasan }}",
                        "options": {"responseCode": "={{ $json.kode_balas }}"}},
         "id": nid(10), "name": "Balas ke Marketplace", "type": "n8n-nodes-base.respondToWebhook",
         "typeVersion": 1.1, "position": [1920, -200]},
        {"parameters": {"respondWith": "json",
                        "responseBody": "={{ { status: 'gagal_ambil_detail', platform: $json.platform, order_id: $json.order_id, alasan: $json.alasan } }}",
                        "options": {"responseCode": 500}},
         "id": nid(11), "name": "Balas 500 - Gagal Ambil Detail", "type": "n8n-nodes-base.respondToWebhook",
         "typeVersion": 1.1, "position": [1440, 20]},
        {"parameters": {"respondWith": "json",
                        "responseBody": "={{ { status: $json.dikenal ? 'diabaikan' : 'tidak_dikenal', platform: $json.platform, order_id: $json.order_id, status_marketplace: $json.status_mentah, alasan: $json.alasan } }}",
                        "options": {"responseCode": "={{ $json.dikenal ? 200 : 400 }}"}},
         "id": nid(12), "name": "Balas - Diabaikan", "type": "n8n-nodes-base.respondToWebhook",
         "typeVersion": 1.1, "position": [720, 160]},
    ]

    def ke(*target):
        return {"main": [[{"node": t, "type": "main", "index": 0}] for t in target]}

    connections = {
        "Terima Notifikasi (Webhook)": ke("Kenali Notifikasi"),
        "Kenali Notifikasi": ke("Perlu Dicatat?"),
        "Perlu Dicatat?": ke("Ambil Detail Order (API Marketplace)", "Balas - Diabaikan"),
        "Ambil Detail Order (API Marketplace)": ke("Terjemahkan ke Format Glowra"),
        "Terjemahkan ke Format Glowra": ke("Detail Didapat?"),
        "Detail Didapat?": ke("Kirim ke Gerbang Order (workflow 03)", "Balas 500 - Gagal Ambil Detail"),
        "Kirim ke Gerbang Order (workflow 03)": ke("Siapkan Balasan"),
        "Siapkan Balasan": ke("Balas ke Marketplace"),
    }

    wf = {
        "name": "Glowra 04 - Notifikasi Marketplace (Shopee & TikTok)",
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
