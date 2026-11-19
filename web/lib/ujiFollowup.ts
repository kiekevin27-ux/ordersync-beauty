/**
 * MODE UJI FOLLOW-UP — mencoba alur follow-up tanpa menunggu 3 / 30 hari.
 *
 * "Buat contoh" membuat order website berawalan UJI-FU- yang seolah-olah SUDAH SAMPAI beberapa hari lalu
 * (lewat gerbang order yang sama dengan checkout), sehingga langsung masuk daftar follow-up hari ini.
 * "Reset" menghapus order uji, catatan Follow_Up-nya, order yang dibuat dari link pesan ulang order uji,
 * dan nomor uji di Tidak_Dihubungi.
 */
import { prosesOrder, waktuWib } from "./gerbang";
import { daftarHariIni, hpNormal, TAB_FU, TAB_STOP, type ItemFU } from "./followup";
import { kirimDaftarFollowUp } from "./followupBot";
import { cariProduk } from "./produk";
import { bacaTab, hapusBarisAwalan } from "./sheets";
import { telegramSiap } from "./telegram";

export const AWALAN_UJI_FU = "UJI-FU-";

const tglMundur = (n: number) => new Date(Date.parse(`${waktuWib().slice(0, 10)}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

export type Skenario = "ulasan" | "beli_ulang";

const SKENARIO: Record<Skenario, { sku: string; sampaiHariLalu: (lama: number) => number; pesanHariLalu: number }> = {
  // sampai 3 hari lalu → jatuh tempo minta ulasan hari ini
  ulasan: { sku: "GLW-SRM-002", sampaiHariLalu: () => 3, pesanHariLalu: 6 },
  // serum 30 hari: jatuh tempo beli ulang = sampai + 25 hari → sampai 25 hari lalu (ulasan H+3 sudah lewat jendela? tidak: 22 hari > 14, jadi tidak ikut)
  beli_ulang: { sku: "GLW-SRM-001", sampaiHariLalu: (lama) => lama - 5, pesanHariLalu: 28 },
};

export async function buatContoh(skenario: Skenario, nama: string, hp: string): Promise<{ ok: boolean; pesan: string }> {
  const s = SKENARIO[skenario];
  const p = cariProduk(s.sku);
  if (!s || !p) return { ok: false, pesan: "Skenario tidak dikenal" };
  const digit = hpNormal(hp);
  if (!/^628\d{8,11}$/.test(digit)) return { ok: false, pesan: "Nomor WhatsApp harus nomor Indonesia, contoh 0812-3456-7890" };
  const sampai = tglMundur(s.sampaiHariLalu(p.lama_pakai_hari));
  const wib = waktuWib();
  const no = `${AWALAN_UJI_FU}${wib.slice(0, 10).replace(/-/g, "")}-${wib.slice(11, 19).replace(/:/g, "")}-${skenario === "ulasan" ? "U" : "B"}`;
  const g = await prosesOrder({
    channel: "website", no_pesanan: no, nama_pembeli: nama.trim() || "Pelanggan Uji", no_hp: hp,
    status_pesanan: "sampai", tanggal_pesanan: `${tglMundur(s.pesanHariLalu)} 10:00`, sampai_pada: `${sampai} 14:00`, izin_wa: "ya",
    items: [{ sku: p.sku, qty: 1, harga_satuan: p.harga }],
  });
  if (g.http !== 200) return { ok: false, pesan: String((g.balasan.errors as string[] | undefined)?.join("; ") ?? g.balasan.pesan ?? "Gagal membuat order uji") };
  return {
    ok: true,
    pesan: skenario === "ulasan"
      ? `Order uji ${no} dibuat: ${p.nama} sampai 3 hari lalu → masuk daftar "minta ulasan" hari ini.`
      : `Order uji ${no} dibuat: ${p.nama} (habis ±${p.lama_pakai_hari} hari) sampai ${s.sampaiHariLalu(p.lama_pakai_hari)} hari lalu → masuk daftar "beli ulang" hari ini.`,
  };
}

export async function kirimSekarang(): Promise<{ ok: boolean; pesan: string }> {
  if (!telegramSiap()) return { ok: false, pesan: "Bot Telegram belum diatur (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)." };
  const n = await kirimDaftarFollowUp();
  return { ok: true, pesan: n ? `Daftar ${n} pelanggan dikirim ke Telegram pemilik toko 📱` : "Daftar kosong, pesan 'tidak ada follow-up' dikirim ke Telegram." };
}

export async function daftar(): Promise<ItemFU[]> {
  return daftarHariIni();
}

export async function resetUji(): Promise<{ ok: boolean; pesan: string }> {
  // nomor HP order uji (untuk dibersihkan dari Tidak_Dihubungi)
  const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
  const hpUji = [...new Set(Order_Masuk.filter((r) => String(r.no_pesanan ?? "").startsWith(AWALAN_UJI_FU)).map((r) => hpNormal(r.no_hp_normal || r.no_hp_asli)))];
  const ulang = await hapusBarisAwalan("Order_Masuk", "dari_followup", AWALAN_UJI_FU).catch(() => 0);
  const order = await hapusBarisAwalan("Order_Masuk", "no_pesanan", AWALAN_UJI_FU);
  const fu = await hapusBarisAwalan(TAB_FU, "id", AWALAN_UJI_FU).catch(() => 0);
  let stop = 0;
  for (const hp of hpUji) stop += await hapusBarisAwalan(TAB_STOP, "no_hp", hp).catch(() => 0);
  return {
    ok: true,
    pesan: order || ulang || fu || stop
      ? `Dihapus: ${order} baris order uji, ${ulang} baris pesanan ulang, ${fu} catatan follow-up${stop ? `, ${stop} nomor di Tidak_Dihubungi` : ""}.`
      : "Tidak ada data uji. Semua sudah bersih.",
  };
}
