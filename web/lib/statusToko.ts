/**
 * UBAH STATUS ORDER WEBSITE / WHATSAPP dari Dashboard.
 *
 * Order marketplace (Shopee/TikTok) statusnya dikabari marketplace lewat webhook, jadi tidak diubah
 * di sini. Order dari toko sendiri dikemas & dikirim oleh toko, jadi pemilik toko yang menandainya:
 *   baru → diproses (dikemas) → dikirim (isi kurir + resi) → sampai → selesai   (atau batal)
 *
 * Order disusun ulang dari baris-baris di sheet lalu dikirim lagi ke gerbang order yang sama
 * (lib/gerbang.ts), sehingga aturan validasi, upsert, notifikasi Telegram, dan cek stok tetap satu jalur.
 */
import { prosesOrder } from "./gerbang";
import { DAFTAR_KURIR, LABEL_STATUS, LANGKAH, resiDemo } from "./lacak";
import { bacaTab } from "./sheets";

/** Tanggal di sheet bisa berupa teks "2026-11-16 14:05" atau angka seri tanggal Google Sheets. */
function teksTanggal(v: unknown): string {
  if (typeof v !== "number") return String(v ?? "");
  return new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 16).replace("T", " ");
}

export type HasilUbahStatus = { ok: boolean; pesan: string; status?: string; kurir?: string; no_resi?: string };

export async function ubahStatusToko(input: { no_pesanan: string; status: string; kurir?: string; no_resi?: string }): Promise<HasilUbahStatus> {
  const no = String(input.no_pesanan ?? "").trim();
  const status = String(input.status ?? "").trim().toLowerCase();
  if (!no) return { ok: false, pesan: "No pesanan wajib diisi" };

  const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
  const baris = Order_Masuk.filter((r) => String(r.no_pesanan ?? "") === no);
  if (!baris.length) return { ok: false, pesan: `Order ${no} tidak ditemukan di Google Sheets` };

  const r = baris[0];
  const channel = String(r.channel);
  if (channel !== "website" && channel !== "whatsapp") {
    return { ok: false, pesan: `Order ${channel} statusnya dikabari otomatis oleh marketplace, tidak diubah dari sini` };
  }
  const sekarang = String(r.status_pesanan || "baru").toLowerCase();
  if (!(LANGKAH[sekarang] ?? []).includes(status)) {
    return { ok: false, pesan: `Status ${LABEL_STATUS[sekarang] ?? sekarang} tidak bisa langsung diubah ke ${LABEL_STATUS[status] ?? status}` };
  }

  // Kurir & resi wajib saat paket diserahkan ke kurir. Resi kosong → dibuatkan resi DEMO.
  let kurir = String((status === "dikirim" ? input.kurir : undefined) ?? r.kurir ?? "").trim();
  let resi = String(input.no_resi ?? "").trim() || String(r.no_resi ?? "").trim();
  if (status === "dikirim") {
    if (!DAFTAR_KURIR.includes(kurir)) kurir = DAFTAR_KURIR[0];
    if (!resi) resi = resiDemo(kurir);
    if (!/^[A-Za-z0-9-]{6,30}$/.test(resi)) return { ok: false, pesan: "No resi hanya boleh huruf, angka, dan tanda minus (6-30 karakter)" };
  }

  const g = await prosesOrder({
    channel,
    no_pesanan: no,
    nama_pembeli: r.nama_pembeli,
    no_hp: String(r.no_hp_asli || r.no_hp_normal || ""),
    status_pesanan: status,
    tanggal_pesanan: teksTanggal(r.tanggal_pesanan),
    ...(kurir ? { kurir } : {}),
    ...(resi ? { no_resi: resi } : {}),
    items: baris.map((b) => ({ sku: b.sku, qty: b.qty, ...(b.harga_satuan === "" || b.harga_satuan === undefined ? {} : { harga_satuan: b.harga_satuan }) })),
  });
  if (g.http !== 200) {
    const err = (g.balasan.errors as string[] | undefined)?.join("; ") ?? String(g.balasan.pesan ?? "gagal");
    return { ok: false, pesan: `Gagal menyimpan: ${err}` };
  }
  const kabar = String(g.balasan.notifikasi_status ?? "");
  return {
    ok: true,
    status,
    kurir: kurir || undefined,
    no_resi: resi || undefined,
    pesan: `Order ${no} sekarang ${LABEL_STATUS[status] ?? status}.${kabar === "terkirim" ? " Kabar sudah dikirim ke Telegram." : kabar.startsWith("gagal") ? " (Kabar ke Telegram gagal terkirim.)" : ""}`,
  };
}
