/**
 * Kirim & terima pesan Telegram (Bot API).
 *
 * Pengaturan (Environment Variables):
 *   TELEGRAM_BOT_TOKEN       token dari @BotFather
 *   TELEGRAM_CHAT_ID         chat id pemilik toko (penerima notifikasi stok & satu-satunya yang boleh
 *                            membaca data toko lewat bot). Pisahkan dengan koma kalau lebih dari satu.
 *   TELEGRAM_WEBHOOK_SECRET  kata sandi acak; Telegram menyertakannya di setiap kiriman ke /api/telegram
 */
export const telegramSiap = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

export const daftarPemilik = () =>
  (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * `coba` & `batasMs`: bawaan 3x10 detik (balasan chat bot). Notifikasi yang dikirim di tengah checkout
 * memakai versi CEPAT (2x4 detik) supaya pembeli tidak ikut menunggu kalau Telegram sedang lambat.
 */
export async function panggilTelegram(metode: string, data: Record<string, unknown>, { coba: maksCoba = 3, batasMs = 10_000 } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diisi");
  let galat: unknown;
  // Koneksi ke Telegram kadang putus sesaat: coba ulang sampai 3x (sama dengan node Telegram di n8n).
  for (let coba = 1; coba <= maksCoba; coba++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${metode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(batasMs),
        cache: "no-store",
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.description ?? `HTTP ${res.status}`);
      return j.result;
    } catch (e) {
      galat = e;
      // Jangan ulang kalau Telegram menolak isi pesan (mis. chat id salah): hasilnya akan sama.
      if (e instanceof Error && /Bad Request|Forbidden|Unauthorized/.test(e.message)) break;
      if (coba < maksCoba) await new Promise((r) => setTimeout(r, 1000 * coba));
    }
  }
  throw galat instanceof Error ? galat : new Error(String(galat));
}

/** Kirim teks biasa ke satu chat. */
export const kirimPesan = (chatId: string | number, teks: string) =>
  panggilTelegram("sendMessage", { chat_id: chatId, text: teks, disable_web_page_preview: true });

/**
 * Kirim notifikasi ke semua pemilik toko (sekaligus, mode cepat: paling lama ±9 detik).
 * Mengembalikan galat pertama (kalau ada).
 */
export async function kirimKePemilik(teks: string): Promise<string | null> {
  const hasil = await Promise.allSettled(
    daftarPemilik().map((id) =>
      panggilTelegram("sendMessage", { chat_id: id, text: teks, disable_web_page_preview: true }, { coba: 2, batasMs: 4_000 }),
    ),
  );
  const gagal = hasil.find((h): h is PromiseRejectedResult => h.status === "rejected");
  return gagal ? (gagal.reason instanceof Error ? gagal.reason.message : String(gagal.reason)) : null;
}
