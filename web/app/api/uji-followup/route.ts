import { NextResponse } from "next/server";
import { sheetsTersambung } from "@/lib/sheets";
import { buatContoh, buatDiantar, buatRiwayat, daftar, kirimSekarang, resetUji, type Skenario } from "@/lib/ujiFollowup";

/**
 * GET  /api/uji-followup → daftar follow-up hari ini (pratinjau, tanpa Telegram)
 * POST /api/uji-followup → { aksi: "contoh", skenario: "ulasan" | "beli_ulang", nama, hp } | { aksi: "riwayat" } | { aksi: "kirim" } | { aksi: "reset" }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const belum = () => NextResponse.json({ ok: false, pesan: "Google Sheets belum tersambung." }, { status: 503 });

export async function GET() {
  if (!sheetsTersambung()) return belum();
  try {
    return NextResponse.json({ ok: true, daftar: await daftar() });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!sheetsTersambung()) return belum();
  let b: { aksi?: string; skenario?: string; nama?: string; hp?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, pesan: "Format permintaan tidak valid" }, { status: 400 });
  }
  try {
    if (b.aksi === "contoh" && (b.skenario === "ulasan" || b.skenario === "beli_ulang")) {
      return NextResponse.json(await buatContoh(b.skenario as Skenario, String(b.nama ?? "").slice(0, 60), String(b.hp ?? "").slice(0, 20)));
    }
    if (b.aksi === "diantar") return NextResponse.json(await buatDiantar(String(b.nama ?? "").slice(0, 60), String(b.hp ?? "").slice(0, 20)));
    if (b.aksi === "riwayat") return NextResponse.json(await buatRiwayat());
    if (b.aksi === "kirim") return NextResponse.json(await kirimSekarang());
    if (b.aksi === "reset") return NextResponse.json(await resetUji());
    return NextResponse.json({ ok: false, pesan: "Aksi tidak dikenal" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, pesan: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
