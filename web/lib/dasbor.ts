/** Hitung angka dashboard dari tab Order_Masuk & Stok_Live. Definisi sama dengan workbook. */
import { bacaTab } from "./sheets";

export type BarisStok = { sku: string; nama: string; tersedia: number; minimum: number; dipesan: number; terjual: number; status: string };
export type OrderRingkas = {
  no_pesanan: string; channel: string; nama: string; tanggal: string; status_pesanan: string; total: number; produk: number;
};
export type DataDasbor = {
  diperbarui: string;
  omzet: number;           // status selesai + dikirim (sama dengan Laba_per_Channel di workbook)
  jumlahOrder: number;     // semua order kecuali batal
  rataRata: number;        // omzet / order (selesai + dikirim)
  perluDiproses: number;   // order status baru + diproses
  perluRestock: number;
  mingguan: { minggu: string; label: string; omzet: number; order: number }[];
  perChannel: { channel: string; omzet: number; order: number }[];
  perStatus: { status: string; order: number }[];
  topProduk: { sku: string; nama: string; qty: number }[];
  stok: BarisStok[];
  terbaru: OrderRingkas[];
};

const STATUS_URUT = ["baru", "diproses", "dikirim", "selesai", "batal", "retur"];
const MASUK_OMZET = new Set(["selesai", "dikirim"]);
const angka = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);

/** Senin dari minggu tanggal YYYY-MM-DD. */
function awalMinggu(tgl: string): string {
  const d = new Date(`${tgl}T00:00:00Z`);
  const hari = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - hari);
  return d.toISOString().slice(0, 10);
}
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const labelTgl = (iso: string) => `${Number(iso.slice(8, 10))} ${BULAN[Number(iso.slice(5, 7)) - 1]}`;

export async function ambilDataDasbor(): Promise<DataDasbor> {
  const t = await bacaTab(["Order_Masuk", "Stok_Live", "Master_Produk"]);
  const nama = new Map(t.Master_Produk.map((p) => [String(p.sku), String(p.nama_produk).replace(/^Glowra\s+/, "")]));

  // ---- Kelompokkan baris (1 baris = 1 produk) per order ----
  type O = OrderRingkas & { items: { sku: string; qty: number }[] };
  const order = new Map<string, O>();
  for (const r of t.Order_Masuk) {
    const no = String(r.no_pesanan ?? "");
    if (!no) continue;
    const tanggal = String(r.tanggal_pesanan || r.diterima_pada_wib || "").slice(0, 16);
    const st = String(r.status_pesanan || "baru").toLowerCase();
    let o = order.get(no);
    if (!o) {
      o = { no_pesanan: no, channel: String(r.channel), nama: String(r.nama_pembeli), tanggal, status_pesanan: st, total: 0, produk: 0, items: [] };
      order.set(no, o);
    }
    o.total += angka(r.subtotal);
    o.produk += 1;
    o.items.push({ sku: String(r.sku), qty: angka(r.qty) });
  }
  const semua = [...order.values()];
  const masuk = semua.filter((o) => MASUK_OMZET.has(o.status_pesanan));
  const omzet = masuk.reduce((s, o) => s + o.total, 0);

  // ---- Omzet per minggu (diisi 0 untuk minggu tanpa penjualan) ----
  const perMinggu = new Map<string, { omzet: number; order: number }>();
  for (const o of masuk) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(o.tanggal)) continue;
    const m = awalMinggu(o.tanggal.slice(0, 10));
    const x = perMinggu.get(m) ?? { omzet: 0, order: 0 };
    x.omzet += o.total;
    x.order += 1;
    perMinggu.set(m, x);
  }
  const kunci = [...perMinggu.keys()].sort();
  const mingguan: DataDasbor["mingguan"] = [];
  if (kunci.length) {
    for (let d = new Date(`${kunci[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= kunci[kunci.length - 1]; d.setUTCDate(d.getUTCDate() + 7)) {
      const k = d.toISOString().slice(0, 10);
      const x = perMinggu.get(k) ?? { omzet: 0, order: 0 };
      mingguan.push({ minggu: k, label: labelTgl(k), ...x });
    }
  }

  // ---- Per channel (urutan tetap) & per status ----
  const perChannel = ["shopee", "tiktok", "website", "whatsapp"]
    .map((ch) => ({ channel: ch, omzet: masuk.filter((o) => o.channel === ch).reduce((s, o) => s + o.total, 0), order: masuk.filter((o) => o.channel === ch).length }))
    .filter((c) => c.order > 0);
  const perStatus = STATUS_URUT.map((st) => ({ status: st, order: semua.filter((o) => o.status_pesanan === st).length })).filter((s) => s.order > 0);

  // ---- Produk terlaris (order selesai + dikirim) ----
  const qty = new Map<string, number>();
  for (const o of masuk) for (const it of o.items) qty.set(it.sku, (qty.get(it.sku) ?? 0) + it.qty);
  const topProduk = [...qty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([sku, q]) => ({ sku, nama: nama.get(sku) ?? sku, qty: q }));

  // ---- Stok ----
  const stok: BarisStok[] = t.Stok_Live.filter((r) => /^GLW-/.test(String(r.SKU))).map((r) => ({
    sku: String(r.SKU),
    nama: String(r["Nama Produk"]).replace(/^Glowra\s+/, ""),
    tersedia: angka(r["Stok Tersedia"]),
    minimum: angka(r["Stok Minimum"]),
    dipesan: angka(r["Dipesan (baru+diproses)"]),
    terjual: angka(r["Terjual (dikirim+selesai)"]),
    status: String(r.Status),
  }));

  const terbaru = [...semua]
    .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
    .slice(0, 8)
    .map(({ items: _items, ...o }) => o);

  return {
    diperbarui: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " "),
    omzet,
    jumlahOrder: semua.filter((o) => o.status_pesanan !== "batal").length,
    rataRata: masuk.length ? Math.round(omzet / masuk.length) : 0,
    perluDiproses: semua.filter((o) => o.status_pesanan === "baru" || o.status_pesanan === "diproses").length,
    perluRestock: stok.filter((s) => s.status !== "AMAN").length,
    mingguan,
    perChannel,
    perStatus,
    topProduk,
    stok,
    terbaru,
  };
}
