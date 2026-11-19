/**
 * FOLLOW-UP PELANGGAN (post-purchase): minta ulasan & pengingat beli ulang.
 *
 * Siapa yang dihubungi: order WEBSITE / WHATSAPP yang
 *   - pembelinya mencentang "boleh dihubungi via WhatsApp" saat checkout (izin_wa = "ya"; UU PDP),
 *   - sudah SAMPAI (kolom sampai_pada terisi saat status diubah ke "sampai"),
 *   - nomornya tidak ada di tab Tidak_Dihubungi.
 * Pembeli Shopee/TikTok TIDAK ikut: nomornya disamarkan & marketplace melarang menarik pembeli keluar platform.
 *
 * Jadwal (dihitung dari tanggal sampai):
 *   ulasan      H+3
 *   beli ulang  saat produk diperkirakan hampir habis = (lama_pakai_hari × qty) − 5 hari, minimal H+7.
 *               Kalau 1 order berisi beberapa produk, yang paling cepat habis yang dipakai.
 *               Dilewati kalau pembeli (no HP sama) sudah membeli produk itu lagi sesudah order tersebut.
 * Item yang jatuh tempo sampai 14 hari lalu tetap muncul (misal pemilik toko sedang libur).
 *
 * Pesan TIDAK dikirim otomatis ke pembeli: setiap pagi bot Telegram mengirim daftar dengan tombol
 * "Buka WhatsApp" (pesan sudah terisi). Pemilik toko yang menekan kirim. Gratis & tanpa risiko nomor diblokir.
 *
 * Tab Google Sheet (dibuat otomatis):
 *   Follow_Up         riwayat: id (no_pesanan|u / |b), status terkirim / dilewati / berhasil, pesanan ulang
 *   Template_Pesan    teks pesan WA yang bisa diedit pemilik toko
 *   Tidak_Dihubungi   no HP yang minta berhenti dihubungi
 */
import { waktuWib } from "./gerbang";
import { cariProduk } from "./produk";
import { namaPendek } from "./format";
import { bacaMentah, bacaTab, pastikanTab, tulisRentang, upsertBaris } from "./sheets";

export const TAB_FU = "Follow_Up";
export const TAB_TEMPLATE = "Template_Pesan";
export const TAB_STOP = "Tidak_Dihubungi";
export const H_ULASAN = 3;
const JENDELA_TERLAMBAT = 14;
const MAKS_PER_HARI = 10;

export type Jenis = "ulasan" | "beli_ulang";
const KODE: Record<Jenis, string> = { ulasan: "u", beli_ulang: "b" };
export const LABEL_JENIS: Record<Jenis, string> = { ulasan: "⭐ Minta ulasan", beli_ulang: "🔁 Pengingat beli ulang" };
export const idFU = (no: string, j: Jenis) => `${no}|${KODE[j]}`;

// Catatan emoji: link wa.me yang dibuka lewat aplikasi WhatsApp Desktop (Windows) bisa mengubah emoji jadi "?".
// Karena itu kartu Telegram punya 2 tombol: wa.me (HP) dan web.whatsapp.com/send (browser laptop).
export const TEMPLATE_BAWAAN: Record<Jenis, string> = {
  ulasan:
    "Halo Kak {nama} 👋 Ini Glowra Beauty. Paketnya sudah sampai ya? Gimana {produk}-nya, cocok di kulit? 😊\n\nBoleh minta ulasan singkatnya? Bantu kami banget 🙏✨ Kalau ada keluhan, balas chat ini saja ya.",
  beli_ulang:
    "Halo Kak {nama} 😊 {produk} yang Kakak beli {hari} hari lalu biasanya sudah mau habis nih.\n\nMau pesan lagi? Keranjangnya sudah kami siapkan, tinggal klik: {link}\n\nBalas STOP kalau tidak ingin diingatkan lagi ya 🙏",
};

// ---------------------------------------------------------------------------
// Bantuan tanggal & nomor
// ---------------------------------------------------------------------------
const tglTeks = (v: unknown) =>
  typeof v === "number" ? new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 16).replace("T", " ") : String(v ?? "").trim();
const tambahHari = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const selisihHari = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400_000);
export const hpNormal = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.startsWith("0") ? "62" + d.slice(1) : d.startsWith("8") ? "62" + d : d;
};
const angka = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0);

/** Alamat website untuk link "pesan ulang". */
export function alamatSitus(): string {
  const s = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return (s || "https://web-inky-five-78.vercel.app").replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Membaca data
// ---------------------------------------------------------------------------
type Order = {
  no: string; channel: string; nama: string; hp: string; tanggal: string; status: string; izin: boolean;
  sampai: string; dariFollowup: string; total: number; items: { sku: string; qty: number }[];
};

export type ItemFU = {
  id: string; jenis: Jenis; no: string; nama: string; hp: string; jatuhTempo: string; terlambat: number;
  produk: string; hari: number; pesan: string;
  /** wa.me: untuk HP. */
  linkWa: string;
  /** web.whatsapp.com: untuk laptop lewat browser (emoji aman, tidak lewat aplikasi WhatsApp Desktop). */
  linkWaWeb: string;
};

type DataFU = { orders: Order[]; riwayat: Map<string, Record<string, unknown>>; template: Record<Jenis, string>; stop: Set<string> };

async function bacaTabAman(tab: string, judul: string[]): Promise<Record<string, unknown>[]> {
  try {
    return (await bacaTab([tab]))[tab];
  } catch (e) {
    if (!/Unable to parse range/i.test(String(e))) throw e;
    await pastikanTab(tab);
    await tulisRentang(tab, "A1", [judul]);
    return [];
  }
}

const JUDUL_FU = ["id", "no_pesanan", "jenis", "nama", "no_hp", "status", "diperbarui_wib", "oleh", "pesanan_ulang", "omzet_ulang", "catatan"];

async function bacaData(): Promise<DataFU> {
  const [{ Order_Masuk }, fu, tpl, stop] = await Promise.all([
    bacaTab(["Order_Masuk"]),
    bacaTabAman(TAB_FU, JUDUL_FU),
    bacaTabAman(TAB_TEMPLATE, ["kunci", "teks"]),
    bacaTabAman(TAB_STOP, ["no_hp", "nama", "waktu_wib", "catatan"]),
  ]);
  // Template: isi bawaan kalau tab masih kosong, supaya pemilik toko tinggal mengedit.
  const template = { ...TEMPLATE_BAWAAN };
  if (!tpl.length) await tulisRentang(TAB_TEMPLATE, "A2", Object.entries(TEMPLATE_BAWAAN));
  for (const r of tpl) {
    const k = String(r.kunci ?? "") as Jenis;
    if (k in template && String(r.teks ?? "").trim()) template[k] = String(r.teks);
  }
  const peta = new Map<string, Order>();
  for (const r of Order_Masuk) {
    const no = String(r.no_pesanan ?? "");
    if (!no) continue;
    let o = peta.get(no);
    if (!o) {
      o = {
        no, channel: String(r.channel ?? ""), nama: String(r.nama_pembeli ?? ""), hp: hpNormal(r.no_hp_normal || r.no_hp_asli),
        tanggal: tglTeks(r.tanggal_pesanan || r.diterima_pada_wib), status: String(r.status_pesanan || "baru").toLowerCase(),
        izin: String(r.izin_wa ?? "").toLowerCase() === "ya", sampai: tglTeks(r.sampai_pada), dariFollowup: String(r.dari_followup ?? ""),
        total: 0, items: [],
      };
      peta.set(no, o);
    }
    o.total += angka(r.subtotal);
    o.items.push({ sku: String(r.sku), qty: angka(r.qty) || 1 });
  }
  return {
    orders: [...peta.values()],
    riwayat: new Map(fu.map((r) => [String(r.id), r])),
    template,
    stop: new Set(stop.map((r) => hpNormal(r.no_hp))),
  };
}

function isiTemplate(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
}

const namaDepan = (n: string) => n.split(" ")[0] || n;

// ---------------------------------------------------------------------------
// Daftar follow-up hari ini
// ---------------------------------------------------------------------------
export async function daftarHariIni(hariIni = waktuWib().slice(0, 10)): Promise<ItemFU[]> {
  const d = await bacaData();
  const hasil: ItemFU[] = [];
  for (const o of d.orders) {
    if (o.channel !== "website" && o.channel !== "whatsapp") continue;
    if (!o.izin || !o.sampai || !["sampai", "selesai"].includes(o.status)) continue;
    if (!/^628\d{8,11}$/.test(o.hp) || d.stop.has(o.hp)) continue;
    const tglSampai = o.sampai.slice(0, 10);
    const produk = o.items.map((i) => ({ ...i, p: cariProduk(i.sku) })).filter((i) => i.p);
    if (!produk.length) continue;

    const calon: { jenis: Jenis; tempo: string; produk: string }[] = [];
    calon.push({ jenis: "ulasan", tempo: tambahHari(tglSampai, H_ULASAN), produk: namaPendek(produk[0].p!.nama) + (produk.length > 1 ? ` & ${produk.length - 1} produk lain` : "") });
    // produk yang paling cepat habis
    const habis = produk.map((i) => ({ i, hari: i.p!.lama_pakai_hari * i.qty })).sort((a, b) => a.hari - b.hari)[0];
    // sudah membeli produk yang SAMA lagi sesudah order ini → tidak perlu diingatkan
    const sudahBeliLagi = d.orders.some((x) => x.no !== o.no && x.hp === o.hp && x.tanggal > o.tanggal && x.status !== "batal" && x.items.some((i) => i.sku === habis.i.sku));
    if (!sudahBeliLagi) calon.push({ jenis: "beli_ulang", tempo: tambahHari(tglSampai, Math.max(7, habis.hari - 5)), produk: namaPendek(habis.i.p!.nama) });

    for (const c of calon) {
      const id = idFU(o.no, c.jenis);
      if (d.riwayat.has(id) && String(d.riwayat.get(id)!.status ?? "") !== "") continue; // sudah ditangani
      const terlambat = selisihHari(hariIni, c.tempo);
      if (terlambat < 0 || terlambat > JENDELA_TERLAMBAT) continue;
      const hari = selisihHari(hariIni, o.tanggal.slice(0, 10) || tglSampai);
      const pesan = isiTemplate(d.template[c.jenis], {
        nama: namaDepan(o.nama), produk: c.produk, hari: String(hari), no_pesanan: o.no,
        link: `${alamatSitus()}/pesan-ulang/${encodeURIComponent(o.no)}`,
      });
      hasil.push({
        id, jenis: c.jenis, no: o.no, nama: o.nama, hp: o.hp, jatuhTempo: c.tempo, terlambat, produk: c.produk, hari, pesan,
        linkWa: `https://wa.me/${o.hp}?text=${encodeURIComponent(pesan)}`,
        linkWaWeb: `https://web.whatsapp.com/send?phone=${o.hp}&text=${encodeURIComponent(pesan)}`,
      });
    }
  }
  return hasil.sort((a, b) => b.terlambat - a.terlambat || a.jatuhTempo.localeCompare(b.jatuhTempo)).slice(0, 50);
}

// ---------------------------------------------------------------------------
// Mencatat hasil
// ---------------------------------------------------------------------------
export async function catatStatus(id: string, status: "terkirim" | "dilewati", info: Partial<Record<string, unknown>> = {}) {
  const [no, kode] = id.split("|");
  await upsertBaris(TAB_FU, [{
    id, no_pesanan: no, jenis: kode === "u" ? "ulasan" : "beli_ulang", status, diperbarui_wib: waktuWib(), ...info,
  }], "id");
}

/** Order baru dibuat dari link "pesan ulang" → follow-up beli ulang order lama dicatat BERHASIL. */
export async function catatBerhasil(noLama: string, noBaru: string, omzet: number) {
  await pastikanTab(TAB_FU);
  const isi = await bacaMentah(TAB_FU);
  if (!isi.length) await tulisRentang(TAB_FU, "A1", [JUDUL_FU]);
  await upsertBaris(TAB_FU, [{
    id: idFU(noLama, "beli_ulang"), no_pesanan: noLama, jenis: "beli_ulang", status: "berhasil",
    diperbarui_wib: waktuWib(), pesanan_ulang: noBaru, omzet_ulang: omzet,
  }], "id");
}

/** Nomor minta berhenti dihubungi. */
export async function hentikanKontak(hp: string, nama: string) {
  await pastikanTab(TAB_STOP);
  const isi = await bacaMentah(TAB_STOP);
  if (!isi.length) await tulisRentang(TAB_STOP, "A1", [["no_hp", "nama", "waktu_wib", "catatan"]]);
  await upsertBaris(TAB_STOP, [{ no_hp: hpNormal(hp), nama, waktu_wib: waktuWib(), catatan: "ditandai dari bot Telegram" }], "no_hp");
}

// ---------------------------------------------------------------------------
// Statistik bulan ini (dashboard)
// ---------------------------------------------------------------------------
export type StatFU = { bulan: string; terkirim: number; ulasan: number; beliUlang: number; berhasil: number; omzetUlang: number; menunggu: number };

export async function statistik(): Promise<StatFU> {
  const bulan = waktuWib().slice(0, 7);
  const [fu, menunggu] = await Promise.all([bacaTabAman(TAB_FU, JUDUL_FU), daftarHariIni().catch(() => [])]);
  const ini = fu.filter((r) => String(r.diperbarui_wib ?? "").startsWith(bulan));
  const dikirim = ini.filter((r) => ["terkirim", "berhasil"].includes(String(r.status)));
  const berhasil = ini.filter((r) => String(r.status) === "berhasil");
  return {
    bulan,
    terkirim: dikirim.length,
    ulasan: dikirim.filter((r) => r.jenis === "ulasan").length,
    beliUlang: dikirim.filter((r) => r.jenis === "beli_ulang").length,
    berhasil: berhasil.length,
    omzetUlang: berhasil.reduce((s, r) => s + angka(r.omzet_ulang), 0),
    menunggu: menunggu.length,
  };
}

export const MAKS_KIRIM_SEHARI = MAKS_PER_HARI;
