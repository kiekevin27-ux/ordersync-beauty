/**
 * PELACAKAN PESANAN: label status, data kurir/resi, dan notifikasi Telegram saat status berubah.
 *
 * Alur status (semua channel):
 *   baru → diproses (sedang dikemas) → dikirim (sedang diantar) → sampai → selesai
 *   (atau batal / retur)
 *
 * Setiap kali gerbang order (lib/gerbang.ts) menyimpan 1 order dan statusnya BERBEDA dari yang
 * sudah tercatat di sheet, pemilik toko dikabari lewat bot Telegram. Order baru juga dikabari.
 * Order uji (no pesanan berawalan UJI-) dan kiriman batch (import) tidak dikabari supaya tidak spam.
 */
import { rupiah } from "./format";
import { kirimKePemilik, telegramSiap } from "./telegram";

export const URUTAN_STATUS = ["baru", "diproses", "dikirim", "sampai", "selesai", "batal", "retur"] as const;

export const LABEL_STATUS: Record<string, string> = {
  baru: "🆕 Baru",
  diproses: "📦 Sedang dikemas",
  dikirim: "🚚 Sedang diantar",
  sampai: "🏠 Sudah sampai",
  selesai: "✅ Selesai",
  batal: "❌ Batal",
  retur: "↩️ Retur",
};

export const LABEL_CHANNEL: Record<string, string> = { shopee: "Shopee", tiktok: "TikTok Shop", website: "Website", whatsapp: "WhatsApp" };

/** Order website/WhatsApp: langkah berikutnya yang boleh dipilih dari tiap status (tombol di Dashboard). */
export const LANGKAH: Record<string, string[]> = {
  baru: ["diproses", "batal"],
  diproses: ["dikirim", "batal"],
  dikirim: ["sampai"],
  sampai: ["selesai", "retur"],
};

/** Kurir yang bisa dipilih untuk order website/WhatsApp (dikirim sendiri oleh toko). */
export const DAFTAR_KURIR = ["JNE", "J&T Express", "SiCepat", "AnterAja", "Gojek / Grab"];

const ALFANUM = "0123456789";
const acak = (n: number) => Array.from({ length: n }, () => ALFANUM[Math.floor(Math.random() * 10)]).join("");

/** No resi DEMO (bukan resi asli) dengan pola mirip kurirnya. */
export function resiDemo(kurir: string): string {
  if (/^J&T/i.test(kurir)) return "JX" + acak(10);
  if (/sicepat/i.test(kurir)) return "0040" + acak(8);
  if (/anteraja/i.test(kurir)) return "1000" + acak(9);
  if (/spx|shopee/i.test(kurir)) return "SPXID0" + acak(11);
  if (/gojek|grab/i.test(kurir)) return "GK-" + acak(9);
  return "CGK" + acak(10); // JNE
}

type BarisOrder = {
  no_pesanan: string; channel: string; nama_pembeli: string; status_pesanan: string;
  sku: string; qty: number; subtotal: number | ""; kurir?: string; no_resi?: string;
};

const JUDUL: Record<string, string> = {
  diproses: "sedang dikemas 📦",
  dikirim: "sedang diantar 🚚",
  sampai: "sudah sampai 🏠",
  selesai: "selesai ✅",
  batal: "dibatalkan ❌",
  retur: "diretur ↩️",
  baru: "kembali ke status baru 🆕",
};

/** Susun teks notifikasi. statusLama = null berarti order baru. */
export function teksPerubahanStatus(baris: BarisOrder[], statusLama: string | null, kurir: string, resi: string): string {
  const r = baris[0];
  const total = baris.reduce((s, b) => s + (typeof b.subtotal === "number" ? b.subtotal : 0), 0);
  const asal = `${LABEL_CHANNEL[r.channel] ?? r.channel} · ${r.nama_pembeli}${total ? ` · ${rupiah(total)}` : ""}`;
  const baru = statusLama === null;
  const baris1 = baru ? `🛒 Order baru masuk: ${r.no_pesanan}` : `Order ${r.no_pesanan} ${JUDUL[r.status_pesanan] ?? r.status_pesanan}`;
  const isi = [
    baris1,
    asal,
    baru ? `Status: ${LABEL_STATUS[r.status_pesanan] ?? r.status_pesanan}` : `Sebelumnya: ${LABEL_STATUS[statusLama] ?? statusLama}`,
  ];
  if (kurir || resi) isi.push(`Kurir: ${kurir || "-"} · Resi: ${resi || "-"}`);
  if (baru) isi.push(...baris.map((b) => `• ${b.sku} × ${b.qty}`));
  isi.push("", `Lacak: /order ${r.no_pesanan}`);
  return isi.join("\n");
}

/**
 * Kabari pemilik toko kalau status order berubah (atau order baru).
 * `sebelum` = isi lama baris-baris order ini di sheet (dari upsertBaris). Hasil: keterangan singkat.
 */
export async function kabariPerubahanStatus(baris: BarisOrder[], sebelum: Record<string, unknown>[]): Promise<string> {
  const r = baris[0];
  if (!r) return "tidak_ada_baris";
  if (r.no_pesanan.startsWith("UJI-")) return "dilewati_order_uji";
  if (!telegramSiap()) return "telegram_belum_diatur";
  const lama = sebelum.find((s) => String(s.no_pesanan) === r.no_pesanan);
  const statusLama = lama ? String(lama.status_pesanan || "baru").toLowerCase() : null;
  if (statusLama === r.status_pesanan) return "status_tidak_berubah";
  const kurir = r.kurir || String(lama?.kurir ?? "");
  const resi = r.no_resi || String(lama?.no_resi ?? "");
  const galat = await kirimKePemilik(teksPerubahanStatus(baris, statusLama, kurir, resi));
  return galat ? `gagal_kirim: ${galat}` : "terkirim";
}
