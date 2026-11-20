import { NextResponse } from "next/server";
import { jawabCS, type Mode } from "@/lib/cs";

/**
 * POST /api/cs → { pesan, mode?, noPesanan? }
 * Customer service otomatis berbasis kata kunci (lib/cs.ts). Tanpa AI, tanpa biaya API.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Rem sederhana supaya chat tidak dipakai menyerbu Telegram admin / kuota Google (per instance server).
const jejak = new Map<string, number[]>();
function terlaluSering(ip: string, batas: number, detik: number): boolean {
  const kini = Date.now();
  const baru = (jejak.get(ip) ?? []).filter((t) => kini - t < detik * 1000);
  baru.push(kini);
  jejak.set(ip, baru);
  if (jejak.size > 5000) jejak.clear();
  return baru.length > batas;
}

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ teks: "Format pesan tidak valid.", mode: "" }, { status: 400 });
  }
  const pesan = String(b.pesan ?? "").trim();
  if (!pesan) return NextResponse.json({ teks: "Tulis pertanyaannya dulu ya, Kak 😊", mode: "" });

  const ip = (req.headers.get("x-forwarded-for") ?? "lokal").split(",")[0].trim();
  if (terlaluSering(ip, 30, 60)) {
    return NextResponse.json({ teks: "Pelan-pelan ya, Kak 😅 Coba lagi sebentar lagi.", mode: "" }, { status: 429 });
  }
  const mode = (["tunggu_hp", "tunggu_admin"].includes(String(b.mode)) ? b.mode : "") as Mode;
  if (mode === "tunggu_admin" && terlaluSering(`admin:${ip}`, 3, 600)) {
    return NextResponse.json({ teks: "Kakak sudah mengirim beberapa pesan ke admin. Mohon tunggu balasannya ya 🙏", mode: "" }, { status: 429 });
  }

  try {
    const balasan = await jawabCS({ pesan, mode, noPesanan: b.noPesanan ? String(b.noPesanan).slice(0, 40) : undefined });
    return NextResponse.json(balasan);
  } catch (e) {
    console.error("CS galat:", e);
    return NextResponse.json({ teks: "Maaf Kak, sistem sedang sibuk. Coba lagi sebentar ya 🙏", mode: "" }, { status: 500 });
  }
}
