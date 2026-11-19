/**
 * FOLLOW-UP lewat bot Telegram: kirim daftar harian (1 kartu per pelanggan) & tangani tombolnya.
 *
 * Tombol (callback_data maks 64 byte):  fu|k|<id> sudah dikirim · fu|l|<id> lewati · fu|s|<id> jangan hubungi lagi
 * <id> = no_pesanan|u (ulasan) atau no_pesanan|b (beli ulang).
 */
import { catatStatus, daftarHariIni, hentikanKontak, LABEL_JENIS, MAKS_KIRIM_SEHARI, type ItemFU } from "./followup";
import { daftarPemilik, panggilTelegram } from "./telegram";

/** 628125550199 → 0812-5550-199 */
const hpTampil = (hp: string) => ("0" + hp.slice(2)).replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");

function teksKartu(x: ItemFU): string {
  return [
    `${LABEL_JENIS[x.jenis]}${x.terlambat > 0 ? ` · terlambat ${x.terlambat} hari` : ""}`,
    `👤 ${x.nama} · ${hpTampil(x.hp)}`,
    `🧾 ${x.no} · ${x.produk}`,
    "",
    "Pesan yang akan terisi di WhatsApp:",
    `“${x.pesan}”`,
  ].join("\n");
}

const tombolKartu = (x: ItemFU) => ({
  inline_keyboard: [
    [{ text: "💬 Buka WhatsApp (pesan sudah terisi)", url: x.linkWa }],
    [{ text: "✅ Sudah dikirim", callback_data: `fu|k|${x.id}` }, { text: "⏭️ Lewati", callback_data: `fu|l|${x.id}` }],
    [{ text: "🚫 Jangan hubungi lagi", callback_data: `fu|s|${x.id}` }],
  ],
});

/** Kirim daftar follow-up ke chat tertentu (atau semua pemilik). Hasil: jumlah pelanggan. */
export async function kirimDaftarFollowUp(chatIds: (string | number)[] = daftarPemilik(), { diamKalauKosong = false } = {}): Promise<number> {
  const daftar = await daftarHariIni();
  if (!daftar.length) {
    if (!diamKalauKosong) for (const c of chatIds) await panggilTelegram("sendMessage", { chat_id: c, text: "💌 Follow-up hari ini: tidak ada pelanggan yang perlu dihubungi. 👍" });
    return 0;
  }
  const tampil = daftar.slice(0, MAKS_KIRIM_SEHARI);
  const ulasan = tampil.filter((x) => x.jenis === "ulasan").length;
  for (const c of chatIds) {
    await panggilTelegram("sendMessage", {
      chat_id: c,
      text: [
        `💌 Follow-up hari ini: ${daftar.length} pelanggan`,
        `${ulasan} minta ulasan · ${tampil.length - ulasan} pengingat beli ulang${daftar.length > tampil.length ? ` (ditampilkan ${tampil.length} dulu)` : ""}`,
        "",
        "Cara: tekan 💬 Buka WhatsApp → kirim pesannya → kembali ke sini, tekan ✅ Sudah dikirim.",
      ].join("\n"),
    });
    for (const x of tampil) {
      await panggilTelegram("sendMessage", { chat_id: c, text: teksKartu(x), reply_markup: tombolKartu(x), disable_web_page_preview: true });
    }
  }
  return daftar.length;
}

/** Tombol di kartu follow-up ditekan. */
export async function tanganiTombolFollowUp(q: { id: string; data: string; chatId: number; messageId: number; teks: string; nama: string }) {
  const [, aksi, ...sisa] = q.data.split("|");
  const id = sisa.join("|");
  const jawab = (teks: string) => (console.log(`[follow-up] ${q.data} → ${teks}`), panggilTelegram)("answerCallbackQuery", { callback_query_id: q.id, text: teks }, { coba: 1, batasMs: 4000 }).catch(() => null);
  // Tombol diganti catatan status, supaya kartu yang sudah ditangani terlihat jelas.
  const ubah = async (catatan: string) => {
    const asli = q.teks.split("\n\n✔")[0];
    await panggilTelegram("editMessageText", {
      chat_id: q.chatId, message_id: q.messageId, text: `${asli}\n\n✔ ${catatan}`, disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [] },
    }).catch(() => null);
  };

  if (!/^.+\|[ub]$/.test(id)) return jawab("Data tombol tidak dikenal");
  // nama & no HP pelanggan dibaca dari teks kartu (supaya tab Follow_Up mudah dibaca manusia)
  const m = q.teks.match(/👤 (.+?) · (0[\d-]+)/);
  const pelanggan = m ? { nama: m[1], no_hp: m[2] } : {};
  try {
    if (aksi === "k") {
      await catatStatus(id, "terkirim", { ...pelanggan, oleh: q.nama });
      await jawab("Dicatat: sudah dikirim");
      return ubah(`Sudah dikirim (${q.nama})`);
    }
    if (aksi === "l") {
      await catatStatus(id, "dilewati", { ...pelanggan, oleh: q.nama });
      await jawab("Dilewati");
      return ubah(`Dilewati (${q.nama})`);
    }
    if (aksi === "s") {
      if (!m) return jawab("Nomor tidak terbaca dari kartu ini");
      await hentikanKontak(m[2], m[1]);
      await catatStatus(id, "dilewati", { ...pelanggan, oleh: q.nama, catatan: "minta tidak dihubungi" });
      await jawab("Nomor ini tidak akan masuk daftar lagi");
      return ubah(`${m[1]} tidak akan dihubungi lagi (tab Tidak_Dihubungi)`);
    }
    return jawab("Aksi tidak dikenal");
  } catch (e) {
    return jawab(`Gagal menyimpan: ${e instanceof Error ? e.message : String(e)}`.slice(0, 190));
  }
}
