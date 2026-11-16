/**
 * MODE UJI STOK — untuk mencoba bot Telegram tanpa harus belanja berkali-kali.
 *
 * Tombol "Habiskan" / "Bikin menipis" membuat SATU order uji dengan qty yang pas supaya stok produk
 * jatuh ke HABIS / RESTOCK. Order uji melewati gerbang order yang sama dengan checkout (jadi alurnya
 * nyata), lalu pemantau stok mengirim peringatan Telegram.
 * Semua order uji memakai no pesanan berawalan "UJI-", sehingga "Reset" bisa menghapusnya tanpa
 * menyentuh order sungguhan, dan stok kembali seperti semula.
 */
import { prosesOrder } from "./gerbang";
import { cariProduk } from "./produk";
import { hapusBarisAwalan } from "./sheets";
import { bacaStok, cekStok, type HasilCekStok } from "./stok";

export const AWALAN_UJI = "UJI-";

export type HasilUji = { ok: boolean; pesan: string; stok?: HasilCekStok };

/** Cek stok setelah sheet berubah. Mode n8n: minta workflow 06. Mode Vercel: pemantau bawaan. */
async function laporStok(): Promise<HasilCekStok | undefined> {
  const url = process.env.N8N_CEK_STOK_URL;
  if (url) {
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20_000) }).catch(() => {});
    return undefined;
  }
  return cekStok();
}

const keteranganTelegram = (s?: HasilCekStok) =>
  !s ? "Peringatan dikirim lewat n8n." : s.notifikasi_dikirim ? "Cek Telegram kamu 📱" : s.galat_telegram ? `Telegram gagal: ${s.galat_telegram}` : "Status tidak berubah, jadi tidak ada notifikasi baru.";

function noPesananUji(sku: string) {
  const wib = new Date(Date.now() + 7 * 3600_000).toISOString();
  return `${AWALAN_UJI}${wib.slice(0, 10).replace(/-/g, "")}-${wib.slice(11, 19).replace(/:/g, "")}-${sku.slice(-7)}`;
}

/** Buat order uji supaya stok `sku` jadi HABIS ("habiskan") atau RESTOCK ("menipis"). */
export async function buatOrderUji(sku: string, mode: "habiskan" | "menipis"): Promise<HasilUji> {
  const p = cariProduk(sku);
  if (!p) return { ok: false, pesan: `Produk ${sku} tidak ditemukan` };
  const s = (await bacaStok()).find((x) => x.sku === p.sku);
  if (!s) return { ok: false, pesan: `${p.sku} tidak ada di tab Stok_Live` };

  // RESTOCK = stok tersedia di bawah minimum tapi masih > 0. Targetnya 1 di bawah minimum.
  const target = mode === "habiskan" ? 0 : Math.max(1, s.minimum - 1);
  const qty = s.tersedia - target;
  if (qty <= 0) {
    return { ok: false, pesan: mode === "habiskan" ? `${s.nama} sudah habis.` : `${s.nama} sudah menipis (sisa ${s.tersedia}). Coba "Habiskan".` };
  }

  const g = await prosesOrder({
    channel: "website",
    no_pesanan: noPesananUji(p.sku),
    nama_pembeli: "Mode Uji Bot",
    no_hp: "081255500000",
    items: [{ sku: p.sku, qty, harga_satuan: p.harga }],
  });
  if (g.http !== 200) return { ok: false, pesan: String(g.balasan.pesan ?? "Order uji gagal dicatat") };

  const stok = await laporStok();
  return { ok: true, stok, pesan: `Order uji ${qty} pcs ${s.nama} tercatat → sisa ${target}. ${keteranganTelegram(stok)}` };
}

/** Hapus semua order uji, lalu cek stok (bot akan melapor produk yang "sudah aman lagi"). */
export async function resetUji(): Promise<HasilUji> {
  const n = await hapusBarisAwalan("Order_Masuk", "no_pesanan", AWALAN_UJI);
  if (!n) return { ok: true, pesan: "Tidak ada order uji. Stok sudah seperti semula." };
  const stok = await laporStok();
  return { ok: true, stok, pesan: `${n} baris order uji dihapus, stok kembali seperti semula. ${keteranganTelegram(stok)}` };
}
