/**
 * PEMANTAU STOK versi Vercel = terjemahan workflow n8n 06 ke TypeScript.
 *
 * Membaca tab Stok_Live (dihitung rumus dari Order_Masuk), lalu mengirim notifikasi Telegram saat
 * ada produk yang BARU masuk status RESTOCK / HABIS, atau sudah AMAN lagi.
 *
 * Anti spam: n8n menyimpan "status terakhir yang sudah dilaporkan" di static data workflow.
 * Vercel tidak punya ingatan antar-panggilan, jadi ingatannya disimpan di tab `Memori_Bot`
 * (dibuat otomatis, sel B2 berisi JSON { SKU: status }).
 */
import { bacaMentah, bacaTab, pastikanTab, tulisRentang } from "./sheets";
import { kirimKePemilik, telegramSiap } from "./telegram";

const TAB_MEMORI = "Memori_Bot";
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export type InfoStok = { sku: string; nama: string; status: string; tersedia: number; minimum: number };

/** "16 Nov 2026 14:05" (WIB) */
export function jamWib(): string {
  const d = new Date(Date.now() + 7 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Semua baris produk di Stok_Live (bukan baris catatan di bawah tabel). */
export async function bacaStok(): Promise<InfoStok[]> {
  const t = await bacaTab(["Stok_Live"]);
  return t.Stok_Live
    .filter((r) => /^GLW-/.test(String(r.SKU ?? "")))
    .map((r) => ({
      sku: String(r.SKU),
      nama: String(r["Nama Produk"] ?? "").replace(/^Glowra\s+/, ""),
      status: String(r.Status ?? "").trim(),
      tersedia: Number(r["Stok Tersedia"]) || 0,
      minimum: Number(r["Stok Minimum"]) || 0,
    }));
}

async function bacaIngatan(): Promise<Record<string, string>> {
  try {
    const isi = await bacaMentah(TAB_MEMORI);
    return JSON.parse(String(isi[1]?.[1] ?? "{}"));
  } catch {
    return {};
  }
}

async function simpanIngatan(status: Record<string, string>) {
  await pastikanTab(TAB_MEMORI);
  await tulisRentang(TAB_MEMORI, "A1:C2", [
    ["kunci", "nilai", "keterangan"],
    ["status_stok", JSON.stringify(status), "Dipakai bot stok supaya tidak mengirim peringatan yang sama berulang kali. Jangan diubah."],
  ]);
}

export const barisStok = (x: InfoStok) =>
  `${x.status === "HABIS" ? "⛔" : "⚠️"} ${x.nama} (${x.sku})\n    sisa ${x.tersedia}, minimum ${x.minimum}`;

export type HasilCekStok = {
  status: "ok";
  notifikasi_dikirim: boolean;
  galat_telegram: string | null;
  masalah_baru: string[];
  pulih: string[];
  perlu_perhatian: InfoStok[];
  pesan: string;
};

/**
 * Cek stok sekarang. `paksa` = kirim ringkasan lengkap walau tidak ada perubahan.
 * `kirim: false` = hanya hitung (dipakai bot saat membalas chat; pesannya dikirim bot sendiri).
 */
export async function cekStok({ paksa = false, kirim = true } = {}): Promise<HasilCekStok> {
  const baris = await bacaStok();
  const lalu = await bacaIngatan();
  const sekarang: Record<string, string> = {};
  const masalahBaru: InfoStok[] = [];
  const pulih: InfoStok[] = [];
  for (const x of baris) {
    sekarang[x.sku] = x.status;
    const sebelumnya = lalu[x.sku] || "AMAN";
    if (x.status !== "AMAN" && x.status !== sebelumnya) masalahBaru.push(x);
    if (x.status === "AMAN" && sebelumnya !== "AMAN") pulih.push(x);
  }
  const semuaMasalah = baris.filter((x) => x.status && x.status !== "AMAN");
  const daftar = paksa ? semuaMasalah : masalahBaru;
  const perluKirim = paksa || daftar.length > 0 || pulih.length > 0;

  const bagian = [paksa ? "📦 Ringkasan stok Glowra Beauty" : "📦 Peringatan stok Glowra Beauty"];
  if (daftar.length) bagian.push(`\nPerlu restock (${daftar.length}):\n` + daftar.map(barisStok).join("\n"));
  else if (paksa) bagian.push("\nSemua produk AMAN ✅");
  if (!paksa && pulih.length) bagian.push(`\nSudah aman lagi ✅:\n` + pulih.map((x) => `• ${x.nama} (sisa ${x.tersedia})`).join("\n"));
  bagian.push(`\nTotal produk perlu perhatian: ${semuaMasalah.length} dari ${baris.length}`);
  bagian.push(`🕒 ${jamWib()} WIB`);
  const pesan = bagian.join("\n");

  let terkirim = false;
  let galat: string | null = null;
  if (kirim && perluKirim) {
    if (!telegramSiap()) galat = "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi";
    else {
      galat = await kirimKePemilik(pesan);
      terkirim = galat === null;
    }
  }
  // Ingatan hanya diperbarui kalau laporan benar-benar terkirim (atau memang tidak ada yang perlu dilaporkan),
  // supaya peringatan yang gagal terkirim dicoba lagi pada pengecekan berikutnya.
  if (kirim && (terkirim || !perluKirim)) {
    const berubah = baris.some((x) => (lalu[x.sku] || "AMAN") !== x.status) || Object.keys(lalu).length !== baris.length;
    if (berubah) await simpanIngatan(sekarang).catch(() => {});
  }

  return {
    status: "ok", notifikasi_dikirim: terkirim, galat_telegram: galat,
    masalah_baru: masalahBaru.map((x) => x.sku), pulih: pulih.map((x) => x.sku), perlu_perhatian: semuaMasalah, pesan,
  };
}
