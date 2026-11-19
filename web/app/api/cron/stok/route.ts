import { NextResponse } from "next/server";
import { cekStok } from "@/lib/stok";
import { kirimDaftarFollowUp } from "@/lib/followupBot";
import { telegramSiap } from "@/lib/telegram";

/**
 * GET /api/cron/stok — dijalankan otomatis oleh Vercel Cron (lihat web/vercel.json), tiap pagi 08:00 WIB.
 * Mengirim ringkasan stok ke Telegram pemilik toko (pengganti jadwal "tiap 5 menit" di n8n: paket gratis
 * Vercel hanya boleh menjadwalkan 1x sehari; pengecekan instan tetap jalan setiap ada order masuk).
 * Pengaman: Vercel mengirim header "Authorization: Bearer <CRON_SECRET>".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // batas aman Vercel Hobby; normalnya selesai < 5 detik

export async function GET(req: Request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia || req.headers.get("authorization") !== `Bearer ${rahasia}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const h = await cekStok({ paksa: true });
    // Daftar follow-up pelanggan hari ini (diam kalau tidak ada; gagal di sini tidak menggagalkan laporan stok).
    let followup: number | string = 0;
    if (telegramSiap()) followup = await kirimDaftarFollowUp(undefined, { diamKalauKosong: true }).catch((e) => `gagal: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ ok: true, notifikasi_dikirim: h.notifikasi_dikirim, galat_telegram: h.galat_telegram, perlu_perhatian: h.perlu_perhatian.length, followup });
  } catch (e) {
    return NextResponse.json({ ok: false, galat: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
