import { NextResponse } from "next/server";
import { balasChat } from "@/lib/bot";
import { tanganiTombolFollowUp } from "@/lib/followupBot";
import { daftarPemilik, kirimPesan, panggilTelegram } from "@/lib/telegram";

/**
 * POST /api/telegram — webhook bot Telegram (@AMBAPRIMEBOT).
 * Telegram mengirim setiap chat & tekanan tombol ke sini; kita balas lewat sendMessage.
 * Pengaman: header X-Telegram-Bot-Api-Secret-Token harus sama dengan TELEGRAM_WEBHOOK_SECRET
 * (diatur saat webhook dipasang), supaya orang lain tidak bisa berpura-pura menjadi Telegram.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // batas aman Vercel Hobby; normalnya selesai < 5 detik

type Update = {
  message?: { chat: { id: number }; from?: { first_name?: string }; text?: string };
  callback_query?: { id: string; data?: string; from: { first_name?: string }; message?: { message_id: number; chat: { id: number }; text?: string } };
};

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

  // ---- Tombol ditekan (kartu follow-up) ----
  const cb = u.callback_query;
  if (cb?.data && cb.message) {
    try {
      if (!daftarPemilik().includes(String(cb.message.chat.id))) {
        await panggilTelegram("answerCallbackQuery", { callback_query_id: cb.id, text: "Khusus pemilik toko" }, { coba: 1 });
      } else if (cb.data.startsWith("fu|")) {
        await tanganiTombolFollowUp({
          id: cb.id, data: cb.data, chatId: cb.message.chat.id, messageId: cb.message.message_id,
          teks: cb.message.text ?? "", nama: cb.from.first_name ?? "Admin",
        });
      } else {
        await panggilTelegram("answerCallbackQuery", { callback_query_id: cb.id }, { coba: 1 });
      }
    } catch (e) {
      console.error("Tombol Telegram gagal:", e);
    }
    return NextResponse.json({ ok: true });
  }

  const m = u.message;
  // Selain pesan teks (stiker, foto, anggota grup masuk, dll.) diabaikan. Tetap balas 200 supaya
  // Telegram tidak mengirim ulang.
  if (!m?.text) return NextResponse.json({ ok: true });

  try {
    const teks = await balasChat({ chatId: m.chat.id, teks: m.text, nama: m.from?.first_name ?? "" });
    if (teks) await kirimPesan(m.chat.id, teks);
  } catch (e) {
    console.error("Bot Telegram gagal membalas:", e);
  }
  return NextResponse.json({ ok: true });
}
