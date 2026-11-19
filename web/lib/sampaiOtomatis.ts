/**
 * ANGGAP SAMPAI OTOMATIS — pengaman kalau admin lupa menandai "Sampai".
 *
 * Order WEBSITE / WHATSAPP yang statusnya masih "diantar" (dikirim) lebih dari HARI_ANGGAP_SAMPAI hari
 * diubah ke "sampai" lewat jalur yang sama dengan tombol di dashboard (lib/statusToko.ts), dengan
 * sampai_otomatis = "ya". Tanpa ini, follow-up (ulasan & beli ulang) untuk order itu tidak pernah berjalan.
 *
 * Dijalankan setiap pagi oleh cron (/api/cron/stok) dan setiap perintah /followup.
 * Order marketplace tidak disentuh: statusnya dikabari Shopee/TikTok sendiri.
 */
import { waktuWib } from "./gerbang";
import { bacaTab } from "./sheets";
import { ubahStatusToko } from "./statusToko";
import { kirimKePemilik } from "./telegram";

export const HARI_ANGGAP_SAMPAI = 4;

const tglTeks = (v: unknown) =>
  typeof v === "number" ? new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 16).replace("T", " ") : String(v ?? "").trim();

export async function anggapSampaiOtomatis({ kabari = true } = {}): Promise<{ diubah: string[]; gagal: string[] }> {
  const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
  const hariIni = waktuWib().slice(0, 10);
  const batas = new Date(Date.parse(`${hariIni}T00:00:00Z`) - HARI_ANGGAP_SAMPAI * 86400_000).toISOString().slice(0, 10);

  const calon = new Map<string, string>(); // no pesanan → tanggal diantar
  for (const r of Order_Masuk) {
    const no = String(r.no_pesanan ?? "");
    if (!no || calon.has(no)) continue;
    if (!["website", "whatsapp"].includes(String(r.channel))) continue;
    if (String(r.status_pesanan).toLowerCase() !== "dikirim") continue;
    // dikirim_pada dicatat sejak fitur ini ada; order lama memakai waktu terakhir baris diperbarui
    const diantar = tglTeks(r.dikirim_pada || r.diterima_pada_wib).slice(0, 10);
    if (diantar && diantar < batas) calon.set(no, diantar);
  }

  const diubah: string[] = [];
  const gagal: string[] = [];
  // maksimal 20 order per putaran (sisanya besok), supaya Telegram tidak kebanjiran & waktu proses aman
  for (const [no, diantar] of [...calon].slice(0, 20)) {
    const h = await ubahStatusToko({ no_pesanan: no, status: "sampai", otomatis: true }).catch((e) => ({ ok: false, pesan: String(e) }));
    (h.ok ? diubah : gagal).push(`${no} (diantar ${diantar})`);
  }
  if (kabari && (diubah.length || gagal.length)) {
    await kirimKePemilik([
      `🏠 Dianggap sampai otomatis: ${diubah.length} order`,
      `Status "Diantar" sudah lebih dari ${HARI_ANGGAP_SAMPAI} hari tanpa ditandai "Sampai", jadi sistem menandainya supaya follow-up pelanggan tetap berjalan.`,
      ...diubah.map((x) => `• ${x}`),
      ...(gagal.length ? ["", `Gagal (${gagal.length}):`, ...gagal.map((x) => `• ${x}`)] : []),
      "",
      "Kalau ternyata paketnya belum sampai/bermasalah, ubah statusnya ke Retur di dashboard.",
    ].join("\n")).catch(() => null);
  }
  return { diubah, gagal };
}
