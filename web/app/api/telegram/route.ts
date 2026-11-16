import { NextResponse } from "next/server";
import { balasChat } from "@/lib/bot";
import { kirimPesan } from "@/lib/telegram";

/**
 * POST /api/telegram — webhook bot Telegram (@AMBAPRIMEBOT).
 * Telegram mengirim setiap chat ke sini; kita balas lewat sendMessage.
 * Pengaman: header X-Telegram-Bot-Api-Secret-Token harus sama dengan TELEGRAM_WEBHOOK_SECRET
 * (diatur saat webhook dipasang), supaya orang lain tidak bisa berpura-pura menjadi Telegram.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Update = { message?: { chat: { id: number }; from?: { first_name?: string }; text?: string } };

export async function POST(req: Request) {
  const rahasia = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!rahasia || req.headers.get("x-telegram-bot-api-secret-token") !== rahasia) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let u: Update;
  try {
    u = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const m = u.message;
  // Selain pesan teks (stiker, foto, anggota grup masuk, dll.) diabaikan. Tetap balas 200 supaya
  // Telegram tidak mengirim ulang.
  if (!m?.text) return NextResponse.json({ ok: true });

  try {
    const teks = await balasChat({ chatId: m.chat.id, teks: m.text, nama: m.from?.first_name ?? "" });
    await kirimPesan(m.chat.id, teks);
  } catch (e) {
    console.error("Bot Telegram gagal membalas:", e);
  }
  return NextResponse.json({ ok: true });
}
