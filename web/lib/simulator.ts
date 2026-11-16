/**
 * Simulator marketplace (khusus demo, berjalan di server toko).
 *
 * Meniru dua hal yang dilakukan Shopee / TikTok Shop sungguhan:
 *  1. MENGIRIM NOTIFIKASI singkat ke webhook kita saat status order berubah.
 *  2. MENYEDIAKAN API "detail order" yang dipanggil n8n untuk mengambil isi order lengkap.
 *
 * Bentuk JSON-nya mengikuti garis besar dokumentasi API resmi (Shopee Open Platform v2
 * get_order_detail & push "order status", TikTok Shop API 202309 Get Order Detail & webhook
 * "order status change"). Saat integrasi sungguhan, field persisnya tetap perlu dicocokkan
 * dengan dokumentasi terbaru.
 *
 * Order disimpan di memori server: hilang kalau server toko dimatikan (cukup untuk demo).
 */
import { cariProduk } from "./produk";

export type Platform = "shopee" | "tiktok";

export const STATUS_PLATFORM: Record<Platform, { kode: string; label: string }[]> = {
  shopee: [
    { kode: "UNPAID", label: "Belum bayar" },
    { kode: "READY_TO_SHIP", label: "Perlu dikirim" },
    { kode: "SHIPPED", label: "Sedang dikirim" },
    { kode: "TO_CONFIRM_RECEIVE", label: "Sudah sampai" },
    { kode: "COMPLETED", label: "Selesai" },
    { kode: "CANCELLED", label: "Batal" },
    { kode: "TO_RETURN", label: "Pengembalian" },
  ],
  tiktok: [
    { kode: "UNPAID", label: "Unpaid" },
    { kode: "AWAITING_SHIPMENT", label: "Awaiting shipment" },
    { kode: "IN_TRANSIT", label: "In transit" },
    { kode: "DELIVERED", label: "Delivered" },
    { kode: "COMPLETED", label: "Completed" },
    { kode: "CANCELLED", label: "Cancelled" },
  ],
};

export type OrderSimulasi = {
  platform: Platform;
  id: string;
  status: string;
  dibuat: number; // detik (unix)
  diubah: number;
  nama: string;
  username: string;
  no_hp: string; // seperti yang akan dikirim API (bisa disamarkan)
  items: { sku: string; nama: string; qty: number; harga: number }[];
  kurir?: string; // diisi marketplace saat paket diserahkan ke kurir
  resi?: string;
};

/** Kurir bawaan tiap marketplace di simulator + pola no resi demo. */
const KURIR: Record<Platform, { nama: string; resi: () => string }> = {
  shopee: { nama: "SPX Express", resi: () => "SPXID0" + acak(11, "0123456789") },
  tiktok: { nama: "J&T Express", resi: () => "JX" + acak(10, "0123456789") },
};
const STATUS_DIKIRIM = new Set(["SHIPPED", "TO_CONFIRM_RECEIVE", "COMPLETED", "IN_TRANSIT", "DELIVERED"]);

// Simpan di globalThis supaya semua route (simulator & API tiruan) memakai data yang sama.
const g = globalThis as unknown as { __glowraSimulator?: Map<string, OrderSimulasi> };
const store = (g.__glowraSimulator ??= new Map<string, OrderSimulasi>());

const kunci = (p: Platform, id: string) => `${p}:${id}`;
export const daftarOrder = () => [...store.values()].sort((a, b) => b.dibuat - a.dibuat);
export const ambilOrder = (p: Platform, id: string) => store.get(kunci(p, id));

const ALFANUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const acak = (n: number, huruf = ALFANUM) => Array.from({ length: n }, () => huruf[Math.floor(Math.random() * huruf.length)]).join("");

function buatId(p: Platform): string {
  if (p === "shopee") {
    // Mirip no pesanan Shopee: yymmdd + 8 karakter. "DM" = penanda data dummy di project ini.
    const wib = new Date(Date.now() + 7 * 3600_000).toISOString();
    return wib.slice(2, 4) + wib.slice(5, 7) + wib.slice(8, 10) + "DM" + acak(6);
  }
  // Mirip Order ID TikTok: 18 digit. Awalan 9900 = penanda data dummy di project ini.
  return "9900" + acak(14, "0123456789");
}

/** Samarkan nomor HP seperti yang sering dilakukan API marketplace. */
function samarkan(p: Platform, hp: string): string {
  const d = hp.replace(/\D/g, "");
  return p === "shopee" ? "******" + d.slice(-2) : `(+62)${d.replace(/^(62|0)/, "").slice(0, 3)}*****${d.slice(-2)}`;
}

/** Format no HP mentah per platform (Shopee: 628…, TikTok: (+62)8…). */
function formatHp(p: Platform, hp: string): string {
  const d = hp.replace(/\D/g, "").replace(/^0/, "62").replace(/^8/, "628");
  return p === "shopee" ? d : `(+62)${d.replace(/^62/, "")}`;
}

export function buatOrder(input: {
  platform: Platform;
  items: { sku: string; qty: number }[];
  nama: string;
  no_hp: string;
  samarkan_hp: boolean;
}): OrderSimulasi | string {
  const items = [];
  for (const it of input.items) {
    const p = cariProduk(it.sku);
    if (!p) return `Produk ${it.sku} tidak ditemukan`;
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 20)) return "Jumlah tiap produk harus 1-20";
    items.push({ sku: p.sku, nama: p.nama, qty, harga: p.harga });
  }
  if (items.length === 0) return "Pilih minimal 1 produk";
  if (!input.nama.trim()) return "Nama pembeli wajib diisi";

  const sekarang = Math.floor(Date.now() / 1000);
  const o: OrderSimulasi = {
    platform: input.platform,
    id: buatId(input.platform),
    status: input.platform === "shopee" ? "READY_TO_SHIP" : "AWAITING_SHIPMENT",
    dibuat: sekarang,
    diubah: sekarang,
    nama: input.nama.trim(),
    username: input.nama.trim().toLowerCase().replace(/\s+/g, "_") + Math.floor(Math.random() * 900 + 100),
    no_hp: input.samarkan_hp ? samarkan(input.platform, input.no_hp) : formatHp(input.platform, input.no_hp),
    items,
  };
  store.set(kunci(o.platform, o.id), o);
  return o;
}

/**
 * Masukkan lagi order yang dikirim balik oleh browser kalau server ini belum mengenalnya
 * (Vercel bisa menjalankan beberapa "server" sekaligus dan ingatannya tidak berbagi).
 * Harga & nama produk diambil ulang dari master produk, bukan dari browser.
 */
export function pulihkanOrder(x: unknown) {
  const o = x as Partial<OrderSimulasi> | null;
  if (!o || (o.platform !== "shopee" && o.platform !== "tiktok") || typeof o.id !== "string" || !/^[A-Z0-9]{6,24}$/.test(o.id)) return;
  if (store.has(kunci(o.platform, o.id)) || !Array.isArray(o.items)) return;
  const items = [];
  for (const it of o.items) {
    const p = cariProduk(String(it?.sku ?? ""));
    const qty = Math.floor(Number(it?.qty));
    if (!p || !(qty >= 1 && qty <= 20)) return;
    items.push({ sku: p.sku, nama: p.nama, qty, harga: p.harga });
  }
  if (!items.length) return;
  const detik = (v: unknown) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : Math.floor(Date.now() / 1000));
  store.set(kunci(o.platform, o.id), {
    platform: o.platform, id: o.id, status: String(o.status ?? ""), dibuat: detik(o.dibuat), diubah: detik(o.diubah),
    nama: String(o.nama ?? "").slice(0, 80), username: String(o.username ?? "").slice(0, 80),
    no_hp: String(o.no_hp ?? "").slice(0, 30), items,
    kurir: o.kurir === KURIR[o.platform].nama ? o.kurir : undefined,
    resi: typeof o.resi === "string" && /^[A-Z0-9]{8,20}$/.test(o.resi) ? o.resi : undefined,
  });
}

export function ubahStatus(p: Platform, id: string, status: string): OrderSimulasi | string {
  const o = store.get(kunci(p, id));
  if (!o) return "Order simulasi tidak ditemukan (mungkin server toko sempat dimatikan)";
  if (!STATUS_PLATFORM[p].some((s) => s.kode === status)) return `Status ${status} tidak dikenal`;
  o.status = status;
  o.diubah = Math.floor(Date.now() / 1000);
  // Begitu paket diserahkan ke kurir, marketplace memberi no resi (sekali saja, tidak berubah lagi).
  if (STATUS_DIKIRIM.has(status) && !o.resi) {
    o.kurir = KURIR[p].nama;
    o.resi = KURIR[p].resi();
  }
  return o;
}

/** Notifikasi singkat yang dikirim marketplace ke webhook (TANPA detail produk & pembeli). */
export function payloadNotifikasi(o: OrderSimulasi) {
  const ts = Math.floor(Date.now() / 1000);
  if (o.platform === "shopee") {
    return { code: 3, shop_id: 1209551, timestamp: ts, data: { ordersn: o.id, status: o.status, update_time: o.diubah } };
  }
  return {
    type: 1,
    tts_notification_id: "7" + acak(18, "0123456789"),
    shop_id: "7494055512026",
    timestamp: ts,
    data: { order_id: o.id, order_status: o.status, update_time: o.diubah },
  };
}

/** Jawaban API tiruan Shopee "get_order_detail". */
export function detailShopee(ids: string[]) {
  const order_list = ids
    .map((id) => store.get(kunci("shopee", id)))
    .filter((o): o is OrderSimulasi => Boolean(o))
    .map((o) => ({
      order_sn: o.id,
      order_status: o.status,
      create_time: o.dibuat,
      update_time: o.diubah,
      currency: "IDR",
      buyer_username: o.username,
      recipient_address: { name: o.nama, phone: o.no_hp, full_address: "(alamat simulasi)" },
      shipping_carrier: o.kurir ?? "",
      // Shopee asli: no resi diambil lewat API logistics.get_tracking_number; di simulator ditaruh di package_list.
      package_list: o.resi ? [{ package_number: `PKG${o.id}`, shipping_carrier: o.kurir, tracking_number: o.resi }] : [],
      item_list: o.items.map((it) => ({
        item_sku: it.sku,
        model_sku: "",
        item_name: it.nama,
        model_quantity_purchased: it.qty,
        model_original_price: it.harga,
        model_discounted_price: it.harga,
      })),
      total_amount: o.items.reduce((s, it) => s + it.harga * it.qty, 0),
    }));
  return { request_id: acak(16).toLowerCase(), error: "", message: "", response: { order_list } };
}

/** Jawaban API tiruan TikTok "Get Order Detail". Catatan: 1 line item = 1 unit barang. */
export function detailTiktok(ids: string[]) {
  const orders = ids
    .map((id) => store.get(kunci("tiktok", id)))
    .filter((o): o is OrderSimulasi => Boolean(o))
    .map((o) => ({
      id: o.id,
      status: o.status,
      create_time: o.dibuat,
      update_time: o.diubah,
      recipient_address: { name: o.nama, phone_number: o.no_hp, full_address: "(alamat simulasi)" },
      shipping_provider: o.kurir ?? "",
      tracking_number: o.resi ?? "",
      line_items: o.items.flatMap((it) =>
        Array.from({ length: it.qty }, (_, i) => ({
          id: `${o.id.slice(-6)}${it.sku.slice(-3)}${i}`,
          seller_sku: it.sku,
          product_name: it.nama,
          sale_price: String(it.harga),
          original_price: String(it.harga),
          currency: "IDR",
        })),
      ),
      payment: { currency: "IDR", total_amount: String(o.items.reduce((s, it) => s + it.harga * it.qty, 0)) },
    }));
  return { code: 0, message: "Success", request_id: acak(20, "0123456789"), data: { orders } };
}
