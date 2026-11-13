import { NextResponse } from "next/server";

/** POST /api/cek-stok → webhook n8n workflow 06 dengan { paksa: true } (kirim ringkasan ke Telegram). */
export const dynamic = "force-dynamic";

export async function POST() {
  const url = process.env.N8N_CEK_STOK_URL;
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
