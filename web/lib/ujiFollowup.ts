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
import { anggapSampaiOtomatis, HARI_ANGGAP_SAMPAI } from "./sampaiOtomatis";
import { cariProduk, semuaProduk } from "./produk";
import { bacaLamaPakai, TAB_LAMA } from "./siklus";
import { bacaTab, hapusBarisAwalan, tulisRentang } from "./sheets";
import { telegramSiap } from "./telegram";

export const AWALAN_UJI_FU = "UJI-FU-";

const tglMundur = (n: number) => new Date(Date.parse(`${waktuWib().slice(0, 10)}T00:00:00Z`) - n * 86400_000).toISOString().slice(0, 10);

export type Skenario = "ulasan" | "beli_ulang";

/** Riwayat beli ulang fiktif untuk kartu "Siklus pakai produk" (6 pelanggan × 2 pembelian Vitamin C). */
const SKU_RIWAYAT = "GLW-SRM-002";
const JARAK_RIWAYAT = [22, 23, 24, 24, 25, 27]; // hari antar pembelian → median 24

const SKENARIO: Record<Skenario, { sku: string; sampaiHariLalu: (lama: number) => number; pesanHariLalu: number }> = {
  // sampai 3 hari lalu → jatuh tempo minta ulasan hari ini
  ulasan: { sku: "GLW-SRM-002", sampaiHariLalu: () => 3, pesanHariLalu: 6 },
  // serum 30 hari: jatuh tempo beli ulang = sampai + 25 hari → sampai 25 hari lalu (ulasan H+3 sudah lewat jendela? tidak: 22 hari > 14, jadi tidak ikut)
  beli_ulang: { sku: "GLW-SRM-001", sampaiHariLalu: (lama) => lama - 5, pesanHariLalu: 28 },
};

/** Order website yang "diantar" 5 hari lalu dan lupa ditandai sampai → besok pagi (atau /followup) dianggap sampai otomatis. */
export async function buatDiantar(nama: string, hp: string): Promise<{ ok: boolean; pesan: string }> {
  const p = cariProduk("GLW-TNR-001");
  if (!p) return { ok: false, pesan: "Produk contoh tidak ditemukan" };
  if (!/^628\d{8,11}$/.test(hpNormal(hp))) return { ok: false, pesan: "Nomor WhatsApp harus nomor Indonesia, contoh 0812-3456-7890" };
  const wib = waktuWib();
  const no = `${AWALAN_UJI_FU}${wib.slice(0, 10).replace(/-/g, "")}-${wib.slice(11, 19).replace(/:/g, "")}-D`;
  const diantar = HARI_ANGGAP_SAMPAI + 1;
  const g = await prosesOrder({
    channel: "website", no_pesanan: no, nama_pembeli: nama.trim() || "Pelanggan Uji", no_hp: hp, izin_wa: "ya",
    status_pesanan: "dikirim", kurir: "JNE", no_resi: `UJI${wib.slice(11, 19).replace(/:/g, "")}`,
    tanggal_pesanan: `${tglMundur(diantar + 1)} 10:00`, dikirim_pada: `${tglMundur(diantar)} 15:00`,
    items: [{ sku: p.sku, qty: 1, harga_satuan: p.harga }],
  });
  if (g.http !== 200) return { ok: false, pesan: String((g.balasan.errors as string[] | undefined)?.join("; ") ?? g.balasan.pesan ?? "Gagal membuat order uji") };
  return { ok: true, pesan: `Order uji ${no} dibuat: status "Diantar" sejak ${diantar} hari lalu, belum ditandai sampai. Tekan "Kirim ke Telegram sekarang" (atau ketik /followup di bot): sistem akan menandainya sampai otomatis.` };
}

export async function buatContoh(skenario: Skenario, nama: string, hp: string): Promise<{ ok: boolean; pesan: string }> {
  const s = SKENARIO[skenario];
  const p = cariProduk(s.sku);
  if (!s || !p) return { ok: false, pesan: "Skenario tidak dikenal" };
  const digit = hpNormal(hp);
  if (!/^628\d{8,11}$/.test(digit)) return { ok: false, pesan: "Nomor WhatsApp harus nomor Indonesia, contoh 0812-3456-7890" };
  const lama = (await bacaLamaPakai()).get(p.sku) ?? p.lama_pakai_hari;
  const sampai = tglMundur(s.sampaiHariLalu(lama));
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
      : `Order uji ${no} dibuat: ${p.nama} (habis ±${lama} hari) sampai ${s.sampaiHariLalu(lama)} hari lalu → masuk daftar "beli ulang" hari ini.`,
  };
}

/** 6 pelanggan fiktif yang membeli serum Vitamin C 2x (status selesai, TANPA izin WA supaya tidak masuk daftar follow-up). */
export async function buatRiwayat(): Promise<{ ok: boolean; pesan: string }> {
  const p = cariProduk(SKU_RIWAYAT);
  if (!p) return { ok: false, pesan: "Produk contoh tidak ditemukan" };
  const wib = waktuWib();
  const cap = `${wib.slice(0, 10).replace(/-/g, "")}${wib.slice(11, 19).replace(/:/g, "")}`;
  const orders = JARAK_RIWAYAT.flatMap((jarak, i) => {
    const awal = 70 + i * 3; // pembelian pertama 70-85 hari lalu
    const dasar = { channel: "website", nama_pembeli: `Pelanggan Riwayat ${i + 1}`, no_hp: `0812555099${i}`, status_pesanan: "selesai", izin_wa: "tidak" };
    const item = [{ sku: p.sku, qty: 1, harga_satuan: p.harga }];
    return [
      { ...dasar, no_pesanan: `${AWALAN_UJI_FU}SK-${cap}-${i}A`, tanggal_pesanan: `${tglMundur(awal)} 10:00`, items: item },
      { ...dasar, no_pesanan: `${AWALAN_UJI_FU}SK-${cap}-${i}B`, tanggal_pesanan: `${tglMundur(awal - jarak)} 10:00`, items: item },
    ];
  });
  const g = await prosesOrder({ orders });
  if (g.http !== 200) return { ok: false, pesan: String(g.balasan.pesan ?? "Gagal membuat riwayat") };
  return { ok: true, pesan: `Riwayat dibuat: 6 pelanggan membeli ${p.nama} 2x dengan jarak ${JARAK_RIWAYAT.join(", ")} hari (median 24). Lihat kartu "Siklus pakai produk" di Dashboard.` };
}

export async function kirimSekarang(): Promise<{ ok: boolean; pesan: string }> {
  if (!telegramSiap()) return { ok: false, pesan: "Bot Telegram belum diatur (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)." };
  const otomatis = await anggapSampaiOtomatis(); // sama dengan cron pagi & /followup
  const n = await kirimDaftarFollowUp();
  const tambahan = otomatis.diubah.length ? ` ${otomatis.diubah.length} order "diantar" > ${HARI_ANGGAP_SAMPAI} hari ditandai sampai otomatis (ulasannya muncul 3 hari lagi).` : "";
  return { ok: true, pesan: (n ? `Daftar ${n} pelanggan dikirim ke Telegram pemilik toko 📱` : "Daftar kosong, pesan 'tidak ada follow-up' dikirim ke Telegram.") + tambahan };
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
  // Lama_Pakai kembali ke perkiraan awal (demo bisa diulang dari nol; ini toko fiktif)
  await bacaLamaPakai();
  await tulisRentang(TAB_LAMA, "A2", semuaProduk().map((p) => [p.sku, p.nama, p.lama_pakai_hari, waktuWib(), "perkiraan awal"]));
  return {
    ok: true,
    pesan: order || ulang || fu || stop
      ? `Dihapus: ${order} baris order uji, ${ulang} baris pesanan ulang, ${fu} catatan follow-up${stop ? `, ${stop} nomor di Tidak_Dihubungi` : ""}. Lama pakai kembali ke perkiraan awal.`
      : "Tidak ada data uji. Lama pakai dikembalikan ke perkiraan awal.",
  };
}
