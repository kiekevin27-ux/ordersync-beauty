/**
 * NOTIFIKASI MARKETPLACE versi Vercel = terjemahan workflow n8n 04 ke TypeScript.
 *
 * Pola API asli: marketplace kirim notifikasi singkat → kita ambil DETAIL order → terjemahkan ke
 * format Glowra → kirim ke gerbang order (lib/gerbang.ts) → balas marketplace.
 * Aturan status & terjemahan sama dengan node "Kenali Notifikasi" dan "Terjemahkan ke Format Glowra".
 */
import { prosesOrder } from "./gerbang";

type Obj = Record<string, unknown>;
type Platform = "shopee" | "tiktok";

const STATUS_SHOPEE: Record<string, string | null> = {
  UNPAID: null, READY_TO_SHIP: "diproses", PROCESSED: "diproses", RETRY_SHIP: "diproses",
  SHIPPED: "dikirim", TO_CONFIRM_RECEIVE: "dikirim", COMPLETED: "selesai",
  IN_CANCEL: "batal", CANCELLED: "batal", TO_RETURN: "retur",
};
const STATUS_TIKTOK: Record<string, string | null> = {
  UNPAID: null, ON_HOLD: null, AWAITING_SHIPMENT: "diproses", AWAITING_COLLECTION: "diproses",
  PARTIALLY_SHIPPING: "diproses", IN_TRANSIT: "dikirim", DELIVERED: "dikirim", COMPLETED: "selesai",
  CANCELLED: "batal",
};

export type Notifikasi = {
  dikenal: boolean; proses: boolean; platform: Platform | null; order_id: string | null;
  status_mentah: string | null; status_pesanan: string | null; alasan: string | null;
};

/** Kenali notifikasi Shopee / TikTok dan putuskan perlu dicatat atau tidak. */
export function kenaliNotifikasi(b: Obj): Notifikasi {
  const d = (b.data ?? {}) as Obj;
  let n: Notifikasi = { dikenal: false, proses: false, platform: null, order_id: null, status_mentah: null, status_pesanan: null,
    alasan: "Format notifikasi tidak dikenali (bukan notifikasi order Shopee/TikTok)" };
  let peta: Record<string, string | null> = {};
  if (d.ordersn && b.shop_id !== undefined) {
    n = { ...n, dikenal: true, platform: "shopee", order_id: String(d.ordersn), status_mentah: String(d.status ?? "") };
    peta = STATUS_SHOPEE;
  } else if (d.order_id && b.type !== undefined) {
    n = { ...n, dikenal: true, platform: "tiktok", order_id: String(d.order_id), status_mentah: String(d.order_status ?? "") };
    peta = STATUS_TIKTOK;
  }
  if (n.dikenal) {
    const st = peta[n.status_mentah!];
    if (st === undefined) n.alasan = `Status ${n.status_mentah} belum dipetakan, notifikasi diabaikan`;
    else if (st === null) n.alasan = `Status ${n.status_mentah}: order belum dibayar/ditahan, belum dicatat`;
    else { n.status_pesanan = st; n.proses = true; n.alasan = null; }
  }
  return n;
}

const wib = (detik: unknown) => new Date(Number(detik) * 1000 + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

/** Gabungkan produk yang SKU-nya sama (TikTok: 1 line item = 1 unit barang). */
function gabung(baris: { sku: string; qty: number; harga_satuan: number }[]) {
  const peta = new Map<string, { sku: string; qty: number; harga_satuan: number }>();
  for (const x of baris) {
    const ada = peta.get(x.sku);
    if (ada) ada.qty += x.qty;
    else peta.set(x.sku, { ...x });
  }
  return [...peta.values()];
}

/** Terjemahkan jawaban API detail order → format standar Glowra. null = order tidak ada di API. */
export function terjemahkan(n: Notifikasi, body: Obj): Obj | null {
  if (n.platform === "shopee") {
    const o = ((body.response as Obj)?.order_list as Obj[] | undefined)?.[0];
    if (!o) return null;
    const alamat = (o.recipient_address ?? {}) as Obj;
    return {
      channel: "shopee", no_pesanan: o.order_sn,
      nama_pembeli: alamat.name || o.buyer_username || "", no_hp: alamat.phone || "",
      status_pesanan: n.status_pesanan, tanggal_pesanan: wib(o.create_time),
      items: gabung(((o.item_list ?? []) as Obj[]).map((it) => ({
        sku: String(it.model_sku || it.item_sku), qty: Number(it.model_quantity_purchased),
        harga_satuan: Math.round(Number(it.model_discounted_price)),
      }))),
    };
  }
  const o = ((body.data as Obj)?.orders as Obj[] | undefined)?.[0];
  if (!o) return null;
  const alamat = (o.recipient_address ?? {}) as Obj;
  return {
    channel: "tiktok", no_pesanan: o.id,
    nama_pembeli: alamat.name || "", no_hp: alamat.phone_number || "",
    status_pesanan: n.status_pesanan, tanggal_pesanan: wib(o.create_time),
    items: gabung(((o.line_items ?? []) as Obj[]).map((li) => ({
      sku: String(li.seller_sku), qty: 1, harga_satuan: Math.round(Number(li.sale_price)),
    }))),
  };
}

/**
 * Proses 1 notifikasi dari awal sampai akhir. `ambilDetail` = cara mengambil detail order
 * (di demo: langsung dari data simulator; untuk API asli: fetch ke Shopee/TikTok dengan token).
 * Hasilnya berbentuk sama dengan balasan workflow 04.
 */
export async function prosesNotifikasi(notif: Obj, ambilDetail: (n: Notifikasi) => Promise<Obj | null>) {
  const n = kenaliNotifikasi(notif);
  if (!n.proses) {
    return { http: n.dikenal ? 200 : 400, balasan: {
      status: n.dikenal ? "diabaikan" : "tidak_dikenal", platform: n.platform, order_id: n.order_id,
      status_marketplace: n.status_mentah, alasan: n.alasan,
    } };
  }
  const detail = await ambilDetail(n).catch(() => null);
  const order = detail ? terjemahkan(n, detail) : null;
  if (!order) {
    return { http: 500, balasan: { status: "gagal_ambil_detail", platform: n.platform, order_id: n.order_id,
      alasan: `Order ${n.order_id} tidak ditemukan di API ${n.platform}` } };
  }
  const g = await prosesOrder(order);
  let status = "tercatat";
  let http = 200;
  if (g.http === 400) status = "ditolak_gerbang"; // data rusak: kirim ulang tidak membantu → tetap 200
  else if (g.http !== 200) { status = "gagal_simpan"; http = 500; } // minta marketplace mengulang
  return { http, balasan: {
    status, platform: n.platform, order_id: n.order_id, status_marketplace: n.status_mentah, status_pesanan: n.status_pesanan,
    order_diterjemahkan: order, gerbang: { http_status: g.http, balasan: g.balasan },
  } };
}
