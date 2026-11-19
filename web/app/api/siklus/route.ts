import { NextResponse } from "next/server";
import { sheetsTersambung } from "@/lib/sheets";
import { terapkan } from "@/lib/siklus";

/** POST /api/siklus { sku, hari } → ubah lama pakai 1 produk di tab Lama_Pakai (tombol "Terapkan saran" di dashboard). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!sheetsTersambung()) return NextResponse.json({ ok: false, pesan: "Google Sheets belum tersambung." }, { status: 503 });
  let b: { sku?: string; hari?: number };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, pesan: "Format permintaan tidak valid" }, { status: 400 });
  }
  try {
    const h = await terapkan(String(b.sku ?? ""), Number(b.hari));
    return NextResponse.json(h, { status: h.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
