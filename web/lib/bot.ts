/**
 * BOT TELEGRAM yang bisa diajak chat (@AMBAPRIMEBOT).
 *
 * Telegram mengirim setiap chat ke /api/telegram (webhook) → fungsi `balasChat` di sini membaca
 * Google Sheets dan menyusun jawaban. Hanya chat id pemilik (TELEGRAM_CHAT_ID) yang boleh melihat
 * data toko; orang lain cukup diberi tahu bahwa bot ini privat.
 */
import { ambilDataDasbor } from "./dasbor";
import { rupiah } from "./format";
import { LABEL_CHANNEL, LABEL_STATUS } from "./lacak";
import { bacaTab } from "./sheets";
import { barisStok, bacaStok, cekStok, jamWib } from "./stok";
import { daftarPemilik } from "./telegram";

/** Menu perintah (juga didaftarkan ke Telegram lewat setMyCommands). */
export const PERINTAH = [
  { command: "ringkasan", description: "Omzet, jumlah order & produk terlaris" },
  { command: "hariini", description: "Order yang masuk hari ini" },
  { command: "terbaru", description: "5 order terakhir" },
  { command: "order", description: "Lacak 1 order (status, kurir, resi), contoh: /order WEB-2026..." },
  { command: "dikemas", description: "Order yang sedang dikemas" },
  { command: "diantar", description: "Order yang sedang diantar kurir" },
  { command: "stok", description: "Stok semua produk" },
  { command: "restock", description: "Produk yang perlu restock" },
  { command: "bantuan", description: "Daftar perintah" },
];

const angka = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);
const hariIniWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function bantuan(nama: string) {
  return [
    `Halo ${nama}! 👋 Saya asisten toko Glowra Beauty.`,
    "Data saya ambil langsung dari Google Sheets toko.",
    "",
    ...PERINTAH.map((p) => `/${p.command} — ${p.description}`),
    "",
    "Saya juga mengabari otomatis setiap ada order baru, order berubah status (dikemas, diantar, sampai, selesai), dan stok menipis.",
  ].join("\n");
}

type BarisOrder = Record<string, unknown>;

/** Kelompokkan baris Order_Masuk (1 baris = 1 produk) per no pesanan. */
async function semuaOrder() {
  const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
  const peta = new Map<string, {
    no: string; channel: string; nama: string; tanggal: string; status: string; total: number; kurir: string; resi: string; items: BarisOrder[];
  }>();
  for (const r of Order_Masuk) {
    const no = String(r.no_pesanan ?? "");
    if (!no) continue;
    let o = peta.get(no);
    if (!o) {
      o = { no, channel: String(r.channel), nama: String(r.nama_pembeli), tanggal: String(r.tanggal_pesanan || r.diterima_pada_wib || "").slice(0, 16),
        status: String(r.status_pesanan || "baru").toLowerCase(), total: 0, kurir: String(r.kurir ?? ""), resi: String(r.no_resi ?? ""), items: [] };
      peta.set(no, o);
    }
    o.total += angka(r.subtotal);
    o.items.push(r);
  }
  return [...peta.values()];
}

/** Garis waktu sederhana: ✔ untuk tahap yang sudah dilewati. */
function perjalanan(status: string): string {
  if (status === "batal" || status === "retur") return `Perjalanan: ${LABEL_STATUS[status]}`;
  const tahap = ["baru", "diproses", "dikirim", "sampai", "selesai"];
  const nama = ["Order masuk", "Dikemas", "Diantar", "Sampai", "Selesai"];
  const posisi = Math.max(0, tahap.indexOf(status));
  return ["Perjalanan:", ...nama.map((n, i) => `${i <= posisi ? "✔" : "○"} ${n}`)].join("\n");
}

const ringkasOrder = (o: { no: string; channel: string; nama: string; tanggal: string; status: string; total: number }) =>
  `• ${o.no}\n   ${LABEL_CHANNEL[o.channel] ?? o.channel} · ${o.nama} · ${rupiah(o.total)}\n   ${o.tanggal} · ${LABEL_STATUS[o.status] ?? o.status}`;

async function jawab(perintah: string, argumen: string, nama: string): Promise<string> {
  switch (perintah) {
    case "start":
    case "bantuan":
    case "help":
      return bantuan(nama);

    case "ringkasan": {
      const d = await ambilDataDasbor();
      return [
        "📊 Ringkasan Glowra Beauty",
        "",
        `Omzet (dikirim + sampai + selesai): ${rupiah(d.omzet)}`,
        `Jumlah order (tanpa batal): ${d.jumlahOrder}`,
        `Rata-rata per order: ${rupiah(d.rataRata)}`,
        `Perlu diproses: ${d.perluDiproses} order`,
        `Perlu restock: ${d.perluRestock} produk`,
        "",
        "Per channel:",
        ...d.perChannel.map((c) => `• ${LABEL_CHANNEL[c.channel] ?? c.channel}: ${rupiah(c.omzet)} (${c.order} order)`),
        "",
        "Terlaris:",
        ...d.topProduk.map((p, i) => `${i + 1}. ${p.nama} — ${p.qty} pcs`),
        "",
        `🕒 ${jamWib()} WIB`,
      ].join("\n");
    }

    case "hariini": {
      const hari = hariIniWib();
      const list = (await semuaOrder()).filter((o) => o.tanggal.startsWith(hari)).sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
      if (!list.length) return `Belum ada order hari ini (${hari}). Coba buat order di toko demo atau simulator 🙂`;
      const aktif = list.filter((o) => o.status !== "batal");
      return [
        `🗓️ Order hari ini (${hari})`,
        `${list.length} order · total ${rupiah(aktif.reduce((s, o) => s + o.total, 0))}`,
        "",
        ...list.slice(0, 15).map(ringkasOrder),
        list.length > 15 ? `\n…dan ${list.length - 15} order lainnya` : "",
      ].join("\n").trim();
    }

    case "terbaru": {
      const list = (await semuaOrder()).sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)).slice(0, 5);
      if (!list.length) return "Belum ada order di Google Sheets.";
      return ["🧾 5 order terakhir", "", ...list.map(ringkasOrder)].join("\n");
    }

    case "dikemas":
    case "diantar": {
      const st = perintah === "dikemas" ? "diproses" : "dikirim";
      const list = (await semuaOrder()).filter((o) => o.status === st).sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
      const judul = perintah === "dikemas" ? "📦 Sedang dikemas" : "🚚 Sedang diantar";
      if (!list.length) return `${judul}: tidak ada order saat ini.`;
      return [
        `${judul} (${list.length} order)`,
        "",
        ...list.slice(0, 15).map((o) => ringkasOrder(o) + (o.resi ? `\n   ${o.kurir} · resi ${o.resi}` : "")),
        list.length > 15 ? `\n…dan ${list.length - 15} order lainnya` : "",
      ].join("\n").trim();
    }

    case "lacak":
    case "order": {
      const no = argumen.trim();
      if (!no) return "Tulis no pesanannya juga ya, contoh:\n/order WEB-20261116-140509-K7Q";
      const o = (await semuaOrder()).find((x) => x.no.toLowerCase() === no.toLowerCase());
      if (!o) return `Order ${no} tidak ditemukan di Google Sheets.`;
      return [
        `🧾 Order ${o.no}`,
        `Channel: ${LABEL_CHANNEL[o.channel] ?? o.channel}`,
        `Pembeli: ${o.nama}`,
        `Tanggal: ${o.tanggal}`,
        `Status: ${LABEL_STATUS[o.status] ?? o.status}`,
        ...(o.kurir || o.resi ? [`Kurir: ${o.kurir || "-"}`, `No resi: ${o.resi || "-"}`] : []),
        "",
        perjalanan(o.status),
        "",
        ...o.items.map((r) => `• ${r.sku} × ${r.qty} = ${rupiah(angka(r.subtotal))}`),
        "",
        `Total: ${rupiah(o.total)}`,
      ].join("\n");
    }

    case "stok": {
      const s = await bacaStok();
      const ikon = (st: string) => (st === "HABIS" ? "⛔" : st === "RESTOCK" ? "⚠️" : "✅");
      return [
        "📦 Stok semua produk",
        "",
        ...s.map((x) => `${ikon(x.status)} ${x.nama}\n    sisa ${x.tersedia} (min ${x.minimum})`),
        "",
        `🕒 ${jamWib()} WIB`,
      ].join("\n");
    }

    case "restock": {
      const masalah = (await bacaStok()).filter((x) => x.status !== "AMAN");
      if (!masalah.length) return "Semua produk AMAN ✅ Belum ada yang perlu restock.";
      return [`⚠️ Perlu restock (${masalah.length}):`, "", ...masalah.map(barisStok)].join("\n");
    }

    case "cek":
      return (await cekStok({ paksa: true, kirim: false })).pesan;

    default:
      return `Perintah /${perintah} belum saya kenal 🤔\n\n${bantuan(nama)}`;
  }
}

/** Pahami 1 pesan chat, kembalikan teks balasan. */
export async function balasChat(pesan: { chatId: number | string; teks: string; nama: string }): Promise<string> {
  const teks = pesan.teks.trim();
  // "/order@AMBAPRIMEBOT WEB-123" → perintah "order", argumen "WEB-123". Teks tanpa "/" dianggap minta bantuan.
  const m = teks.match(/^\/([a-z_]+)(?:@\w+)?\s*([\s\S]*)$/i);
  const perintah = m ? m[1].toLowerCase() : "bantuan";
  const argumen = m ? m[2] : "";

  if (perintah === "id") return `Chat id kamu: ${pesan.chatId}`;
  if (!daftarPemilik().includes(String(pesan.chatId))) {
    return [
      "Halo! 👋 Ini bot demo toko Glowra Beauty (studi kasus otomasi oleh Red Lens).",
      "Data toko hanya bisa dilihat oleh pemilik toko.",
      `Chat id kamu: ${pesan.chatId}`,
    ].join("\n");
  }
  try {
    return await jawab(perintah, argumen, pesan.nama || "Kak");
  } catch (e) {
    return `Maaf, saya gagal membaca Google Sheets 🙏\n(${e instanceof Error ? e.message : String(e)})`;
  }
}
