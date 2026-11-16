import { NextResponse } from "next/server";
import { pingCekStok } from "@/lib/cekStok";
import { sheetsTersambung } from "@/lib/sheets";
import { ubahStatusToko } from "@/lib/statusToko";

/**
 * POST /api/order-status → { no_pesanan, status, kurir?, no_resi? }
 * Dipakai Dashboard untuk menandai order website/WhatsApp: dikemas → dikirim → sampai → selesai.
 * Setiap perubahan dikabari ke Telegram (lib/lacak.ts) lalu stok dicek ulang (batal = stok kembali).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // batas aman Vercel Hobby; normalnya selesai < 5 detik

export async function POST(req: Request) {
  if (!sheetsTersambung()) return NextResponse.json({ ok: false, pesan: "Google Sheets belum tersambung." }, { status: 503 });
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, pesan: "Format permintaan tidak valid" }, { status: 400 });
  }
  try {
    const h = await ubahStatusToko({
      no_pesanan: String(b.no_pesanan ?? ""),
      status: String(b.status ?? ""),
      kurir: b.kurir === undefined ? undefined : String(b.kurir),
      no_resi: b.no_resi === undefined ? undefined : String(b.no_resi),
    });
    if (h.ok) await pingCekStok();
    return NextResponse.json(h, { status: h.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
