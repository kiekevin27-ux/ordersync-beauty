import { NextResponse } from "next/server";
import { sheetsTersambung } from "@/lib/sheets";
import { cekStok } from "@/lib/stok";

/**
 * POST /api/cek-stok → kirim ringkasan stok ke Telegram ({ paksa: true }).
 * Mode n8n: webhook workflow 06. Mode Vercel: pemantau stok bawaan (lib/stok.ts).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // batas aman Vercel Hobby; normalnya selesai < 5 detik

export async function POST() {
  const url = process.env.N8N_CEK_STOK_URL;
  if (!url && sheetsTersambung()) {
    try {
      const j = await cekStok({ paksa: true });
      return NextResponse.json({
        pesan: j.notifikasi_dikirim
          ? `Terkirim ke Telegram ✓ (${j.perlu_perhatian.length} produk perlu perhatian)`
          : `Dicek, tapi Telegram gagal: ${j.galat_telegram ?? "cek token bot"}`,
        hasil: j,
      });
    } catch (e) {
      return NextResponse.json({ pesan: `Gagal membaca stok: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
  }
  if (!url) return NextResponse.json({ pesan: "N8N_CEK_STOK_URL belum diisi (mode demo online)." }, { status: 503 });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paksa: true }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ pesan: `n8n membalas HTTP ${r.status}` }, { status: 502 });
    const n = Array.isArray(j.perlu_perhatian) ? j.perlu_perhatian.length : 0;
    return NextResponse.json({
      pesan: j.notifikasi_dikirim
        ? `Terkirim ke Telegram ✓ (${n} produk perlu perhatian)`
        : `Dicek, tapi Telegram gagal: ${j.galat_telegram ?? "cek kredensial bot"}`,
      hasil: j,
    });
  } catch {
    return NextResponse.json({ pesan: "Tidak bisa menghubungi n8n. Pastikan n8n menyala." }, { status: 502 });
  }
}
