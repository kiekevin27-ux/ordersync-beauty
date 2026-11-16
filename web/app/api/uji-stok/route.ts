import { NextResponse } from "next/server";
import { sheetsTersambung } from "@/lib/sheets";
import { bacaStok } from "@/lib/stok";
import { buatOrderUji, resetUji } from "@/lib/ujiStok";

/**
 * GET  /api/uji-stok → stok semua produk (untuk halaman /uji-stok)
 * POST /api/uji-stok → { aksi: "habiskan" | "menipis", sku } atau { aksi: "reset" }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const belum = () => NextResponse.json({ ok: false, pesan: "Google Sheets belum tersambung." }, { status: 503 });

export async function GET() {
  if (!sheetsTersambung()) return belum();
  try {
    return NextResponse.json({ ok: true, stok: await bacaStok() });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!sheetsTersambung()) return belum();
  let b: { aksi?: string; sku?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, pesan: "Format permintaan tidak valid" }, { status: 400 });
  }
  try {
    if (b.aksi === "reset") return NextResponse.json(await resetUji());
    if (b.aksi === "habiskan" || b.aksi === "menipis") return NextResponse.json(await buatOrderUji(String(b.sku ?? ""), b.aksi));
    return NextResponse.json({ ok: false, pesan: "Aksi tidak dikenal" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
