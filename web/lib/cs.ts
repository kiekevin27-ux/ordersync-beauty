/**
 * Customer service otomatis berbasis KATA KUNCI (tanpa AI, tanpa biaya API).
 *
 * Cara kerja (urutan pengecekan):
 *  1. Mode lanjutan dari pesan sebelumnya (menunggu 4 digit HP / menunggu pesan untuk admin).
 *  2. Nomor pesanan (WEB-..., WA-...) → cek status, tapi minta 4 digit terakhir HP dulu (privasi).
 *  3. Minta admin / komplain → pesan berikutnya diteruskan ke Telegram pemilik toko.
 *  4. FAQ dari tab Google Sheets `FAQ_CS` (pemilik toko bisa menambah kata kunci & jawaban sendiri).
 *  5. Nama produk → kartu produk (harga + stok live dari tab Stok_Live).
 *  6. Jenis kulit (berminyak, kering, jerawat, ...) → rekomendasi produk.
 *  7. Tidak paham → tombol pilihan + dicatat di tab `CS_Tak_Terjawab` supaya bisa ditambahkan ke FAQ.
 */
import { semuaProduk, type Produk } from "./produk";
import { bacaMentah, bacaTab, pastikanTab, sheetsTersambung, tulisRentang, upsertBaris } from "./sheets";
import { bacaStok } from "./stok";
import { kirimKePemilik, telegramSiap } from "./telegram";
import { LABEL_CHANNEL, LABEL_STATUS } from "./lacak";
import { namaPendek, rupiah } from "./format";

export const TAB_FAQ = "FAQ_CS";
export const TAB_TAK_TERJAWAB = "CS_Tak_Terjawab";

export type Mode = "" | "tunggu_hp" | "tunggu_admin";
export type KartuProduk = { sku: string; nama: string; kategori: string; harga: number; stok: "ada" | "sedikit" | "habis" | "?"; sisa?: number };
export type BalasanCS = { teks: string; produk?: KartuProduk[]; pilihan?: string[]; mode: Mode; noPesanan?: string };

const PILIHAN_UTAMA = ["Rekomendasi untuk kulitku", "Ongkir & pengiriman", "Cara bayar", "Cek pesanan", "Chat admin"];

// ---------------------------------------------------------------------------
// FAQ bawaan (ditulis ke tab FAQ_CS saat pertama kali dipakai, lalu yang di Sheet yang dipakai)
// ---------------------------------------------------------------------------
type Faq = { topik: string; kata: string[]; jawaban: string; pilihan: string[] };

const FAQ_BAWAAN: Faq[] = [
  {
    topik: "Ongkir",
    kata: ["ongkir", "ongkos kirim", "biaya kirim", "gratis ongkir", "free ongkir", "freeong"],
    jawaban: "Ongkir dihitung sesuai kota tujuan & kurir ya, Kak 🚚\nGratis ongkir se-Indonesia untuk belanja minimal Rp150.000 (maks. potongan Rp20.000).\n\n(Toko demo: tidak ada pengiriman sungguhan.)",
    pilihan: ["Berapa lama sampai?", "Cara bayar"],
  },
  {
    topik: "Pengiriman",
    kata: ["pengiriman", "kurir", "berapa lama", "lama sampai", "kapan sampai", "estimasi", "dikirim kapan", "jne", "jnt", "j&t", "sicepat", "anteraja", "same day", "instan"],
    jawaban: "Pesanan yang masuk sebelum jam 15.00 WIB dikirim di hari yang sama, Kak 📦\nPerkiraan sampai: Jabodetabek 1–2 hari, Jawa 2–3 hari, luar Jawa 3–7 hari.\nKurir: JNE, J&T, SiCepat, AnterAja, dan Gojek/Grab (khusus Jakarta).",
    pilihan: ["Cek pesanan", "Ongkir"],
  },
  {
    topik: "Pembayaran",
    kata: ["bayar", "pembayaran", "transfer", "qris", "cod", "rekening", "gopay", "ovo", "dana", "shopeepay", "va", "virtual account"],
    jawaban: "Bisa bayar lewat transfer bank (BCA, Mandiri, BRI), QRIS (GoPay, OVO, DANA, ShopeePay), atau COD untuk kota tertentu, Kak 💳\nDetail pembayaran dikirim lewat WhatsApp setelah checkout.\n\n(Toko demo: tidak ada pembayaran sungguhan.)",
    pilihan: ["Cara order", "Ongkir"],
  },
  {
    topik: "Cara order",
    kata: ["cara order", "cara beli", "cara pesan", "gimana order", "gimana beli", "mau order", "mau beli", "mau pesan", "checkout", "order dimana"],
    jawaban: "Gampang, Kak 😊\n1. Klik “+ Keranjang” di produk yang diinginkan\n2. Buka Keranjang → Checkout\n3. Isi nama, nomor WhatsApp & alamat\n4. Konfirmasi ongkir & pembayaran dikirim lewat WhatsApp\n\nBisa juga order lewat Shopee & TikTok Shop Glowra.",
    pilihan: ["Rekomendasi untuk kulitku", "Cara bayar"],
  },
  {
    topik: "Keaslian & BPOM",
    kata: ["bpom", "asli", "original", "ori", "halal", "terdaftar", "palsu", "kw"],
    jawaban: "Semua produk Glowra 100% original, terdaftar BPOM & bersertifikat halal, Kak ✅\nKami hanya menjual lewat website ini, Shopee, dan TikTok Shop resmi Glowra.\n\n(Glowra adalah merek fiktif untuk demo.)",
    pilihan: ["Aman untuk ibu hamil?", "Rekomendasi untuk kulitku"],
  },
  {
    topik: "Ibu hamil & menyusui",
    kata: ["hamil", "bumil", "menyusui", "busui", "kehamilan"],
    jawaban: "Untuk ibu hamil & menyusui, sebaiknya hindari Glowra Retinol Night Serum ya, Kak 🤍\nProduk lain (facial wash, toner centella, moisturizer, sunscreen) umumnya aman, tapi tetap konsultasikan ke dokter kandungan dulu.",
    pilihan: ["Rekomendasi untuk kulitku", "Chat admin"],
  },
  {
    topik: "Urutan pemakaian",
    kata: ["urutan", "step", "rutinitas", "routine", "skincare routine", "cara pakai", "pemakaian", "dipakai kapan", "pagi malam"],
    jawaban: "Urutan skincare Glowra, Kak ✨\n☀️ Pagi: Facial Wash → Toner → Serum (Vitamin C / Niacinamide) → Moisturizer → Sunscreen\n🌙 Malam: Facial Wash → Toner → Serum (Retinol / Niacinamide) → Moisturizer\n\nRetinol & AHA BHA jangan dipakai di malam yang sama ya.",
    pilihan: ["Rekomendasi untuk kulitku", "Starter kit"],
  },
  {
    topik: "Retur & komplain",
    kata: ["retur", "tukar", "refund", "rusak", "pecah", "bocor", "salah kirim", "kembalikan", "dikembalikan", "garansi"],
    jawaban: "Mohon maaf atas kendalanya, Kak 🙏\nProduk rusak / salah kirim bisa ditukar maksimal 3 hari setelah paket sampai, dengan video unboxing.\nKetik “Chat admin” lalu ceritakan masalahnya plus nomor pesanan, admin kami akan bantu.",
    pilihan: ["Chat admin"],
  },
  {
    topik: "Jam operasional",
    kata: ["jam buka", "jam operasional", "buka jam", "jam kerja", "libur", "admin online", "jam berapa", "buka hari"],
    jawaban: "Admin online Senin–Sabtu, 08.00–20.00 WIB, Kak ⏰\nChat otomatis ini aktif 24 jam. Pesan ke admin di luar jam kerja akan dibalas keesokan harinya.",
    pilihan: ["Chat admin"],
  },
  {
    topik: "Promo",
    kata: ["promo", "diskon", "voucher", "kode", "potongan", "sale", "murah", "flash sale"],
    jawaban: "Promo bulan ini, Kak 🎉\n• Gratis ongkir min. belanja Rp150.000\n• Bright Skin Starter Kit hemat dibanding beli satuan\n• Pelanggan yang beli ulang dapat pengingat & penawaran lewat WhatsApp",
    pilihan: ["Starter kit", "Ongkir"],
  },
  {
    topik: "Lokasi toko",
    kata: ["alamat", "lokasi", "toko offline", "outlet", "store", "dimana tokonya", "bisa datang"],
    jawaban: "Glowra belum punya toko offline, Kak 🏠\nBelanja bisa lewat website ini, Shopee, atau TikTok Shop Glowra.",
    pilihan: ["Cara order"],
  },
  {
    topik: "Reseller",
    kata: ["reseller", "dropship", "dropshipper", "agen", "grosir", "kerja sama", "kerjasama", "partner"],
    jawaban: "Wah, terima kasih minatnya, Kak 🤝\nUntuk reseller & dropship, ketik “Chat admin” lalu tulis nama, kota, dan nomor WhatsApp. Tim kami akan kirim info harganya.",
    pilihan: ["Chat admin"],
  },
  {
    topik: "Terima kasih",
    kata: ["terima kasih", "makasih", "makasi", "thanks", "thank you", "thx", "tengkyu", "oke makasih"],
    jawaban: "Sama-sama, Kak 🤍 Semoga kulitnya makin glowing! Kalau ada pertanyaan lain, tanya saja ya.",
    pilihan: [],
  },
];

// ---------------------------------------------------------------------------
// Produk: kata kunci khusus per SKU + kata kunci kategori
// ---------------------------------------------------------------------------
const ALIAS_SKU: Record<string, string[]> = {
  "GLW-SRM-001": ["niacinamide", "niacin", "brightening serum"],
  "GLW-SRM-002": ["vitamin c", "vit c", "vitc", "glow serum"],
  "GLW-SRM-003": ["retinol", "night serum"],
  "GLW-TNR-001": ["centella", "calming toner", "cica"],
  "GLW-TNR-002": ["aha", "bha", "exfoliating", "eksfoliasi", "exfoliasi"],
  "GLW-SNS-001": ["uv shield", "spf50", "spf 50"],
  "GLW-SNS-002": ["tone up", "toneup", "spf35", "spf 35"],
  "GLW-MST-001": ["ceramide", "barrier"],
  "GLW-MST-002": ["oil control", "gel moisturizer"],
  "GLW-FWS-001": ["low ph", "gentle"],
  "GLW-FWS-002": ["acne clear"],
  "GLW-LTN-001": ["rosy"],
  "GLW-LTN-002": ["coral"],
  "GLW-MSK-001": ["sheet mask", "sheetmask"],
  "GLW-SET-001": ["starter kit", "starterkit", "paket", "bundling", "bundle"],
};

const ALIAS_KATEGORI: Record<string, string[]> = {
  Serum: ["serum"],
  Toner: ["toner"],
  Sunscreen: ["sunscreen", "sunblock", "sunskrin", "tabir surya", "spf"],
  Moisturizer: ["moisturizer", "moisturiser", "pelembab", "pelembap", "moist", "krim"],
  "Facial Wash": ["facial wash", "sabun muka", "sabun wajah", "cuci muka", "facial foam", "pembersih", "face wash", "facewash"],
  "Lip Tint": ["lip tint", "liptint", "lip", "bibir", "lipstik", "lipstick"],
  Masker: ["masker", "mask"],
};

/** Jenis kulit → SKU yang direkomendasikan (urut dari yang paling cocok). */
const KULIT: { jenis: string; kata: string[]; sku: string[]; tips: string }[] = [
  { jenis: "berjerawat", kata: ["jerawat", "berjerawat", "jerawatan", "acne", "beruntusan", "bruntusan", "komedo"], sku: ["GLW-FWS-002", "GLW-TNR-002", "GLW-MST-002", "GLW-SNS-001"],
    tips: "Untuk kulit berjerawat, mulai dari pembersih acne + eksfoliasi lembut 2–3x seminggu, lalu pelembab gel yang tidak menyumbat pori." },
  { jenis: "berminyak", kata: ["berminyak", "minyak", "oily", "kilap", "mengkilap"], sku: ["GLW-MST-002", "GLW-TNR-002", "GLW-FWS-002", "GLW-SNS-001"],
    tips: "Kulit berminyak tetap butuh pelembab, Kak, pilih yang teksturnya gel supaya ringan." },
  { jenis: "kering", kata: ["kering", "dry", "kusam kering", "mengelupas", "ketarik", "dehidrasi"], sku: ["GLW-MST-001", "GLW-TNR-001", "GLW-MSK-001", "GLW-FWS-001"],
    tips: "Untuk kulit kering, fokus ke pelembab ceramide + toner yang menenangkan, dan pakai sheet mask 2x seminggu." },
  { jenis: "sensitif", kata: ["sensitif", "sensitive", "kemerahan", "iritasi", "gampang merah", "perih"], sku: ["GLW-FWS-001", "GLW-TNR-001", "GLW-MST-001", "GLW-SNS-002"],
    tips: "Kulit sensitif cocok dengan produk low pH & centella. Selalu tes di belakang telinga dulu ya." },
  { jenis: "kusam", kata: ["kusam", "cerah", "mencerahkan", "glowing", "bekas jerawat", "flek", "noda hitam", "belang", "dull"], sku: ["GLW-SRM-001", "GLW-SRM-002", "GLW-SET-001", "GLW-SNS-002"],
    tips: "Untuk mencerahkan, pakai serum Niacinamide / Vitamin C dan WAJIB sunscreen setiap pagi." },
  { jenis: "penuaan", kata: ["kerutan", "keriput", "garis halus", "anti aging", "antiaging", "penuaan", "awet muda"], sku: ["GLW-SRM-003", "GLW-MST-001", "GLW-SNS-001"],
    tips: "Retinol dipakai malam hari, mulai 2–3x seminggu, dan jangan lupa sunscreen di pagi hari." },
];

// ---------------------------------------------------------------------------
// Alat bantu teks
// ---------------------------------------------------------------------------
const SINGKATAN: Record<string, string> = {
  brp: "berapa", brapa: "berapa", gmn: "gimana", gmna: "gimana", bgmn: "gimana", gk: "tidak", ga: "tidak", gak: "tidak", nggak: "tidak", engga: "tidak",
  tdk: "tidak", yg: "yang", utk: "untuk", untk: "untuk", dgn: "dengan", sdh: "sudah", udh: "sudah", blm: "belum", bs: "bisa", bsa: "bisa",
  pesenan: "pesanan", psnan: "pesanan", ongkirnya: "ongkir", hrg: "harga", hrga: "harga", rdy: "ready", trims: "terima kasih", mksh: "makasih", makasih: "makasih",
};

export function rapikan(teks: string): string {
  const t = teks.toLowerCase().replace(/[^\p{L}\p{N}&\s-]/gu, " ").replace(/\s+/g, " ").trim();
  return " " + t.split(" ").map((k) => SINGKATAN[k] ?? k).join(" ") + " ";
}

/** Apakah `kata` (boleh frasa) muncul sebagai kata utuh di teks yang sudah dirapikan? */
const ada = (t: string, kata: string) => t.includes(` ${kata.toLowerCase()} `);
const skorKata = (t: string, daftar: string[]) => daftar.reduce((n, k) => n + (ada(t, k) ? k.split(" ").length : 0), 0);

// ---------------------------------------------------------------------------
// FAQ dari Google Sheets (cache 60 detik)
// ---------------------------------------------------------------------------
let cacheFaq: { kapan: number; isi: Faq[] } | null = null;

async function ambilFaq(): Promise<Faq[]> {
  if (!sheetsTersambung()) return FAQ_BAWAAN;
  if (cacheFaq && Date.now() - cacheFaq.kapan < 60_000) return cacheFaq.isi;
  try {
    const t = await bacaTab([TAB_FAQ]).catch(() => null);
    let isi: Faq[];
    if (!t || !t[TAB_FAQ]?.length) {
      // Tab belum ada / kosong → buat dan isi dengan FAQ bawaan supaya pemilik toko bisa langsung mengedit.
      await pastikanTab(TAB_FAQ);
      await tulisRentang(TAB_FAQ, "A1", [
        ["topik", "kata_kunci", "jawaban", "tombol_lanjutan"],
        ...FAQ_BAWAAN.map((f) => [f.topik, f.kata.join(", "), f.jawaban, f.pilihan.join(" | ")]),
      ]);
      isi = FAQ_BAWAAN;
    } else {
      isi = t[TAB_FAQ]
        .map((r) => ({
          topik: String(r.topik ?? "").trim(),
          kata: String(r.kata_kunci ?? "").split(",").map((k) => rapikan(k).trim()).filter(Boolean),
          jawaban: String(r.jawaban ?? "").trim(),
          pilihan: String(r.tombol_lanjutan ?? "").split("|").map((p) => p.trim()).filter(Boolean),
        }))
        .filter((f) => f.kata.length && f.jawaban);
    }
    cacheFaq = { kapan: Date.now(), isi };
    return isi;
  } catch {
    return FAQ_BAWAAN;
  }
}

// ---------------------------------------------------------------------------
// Produk & stok
// ---------------------------------------------------------------------------
async function kartu(daftar: Produk[]): Promise<KartuProduk[]> {
  let stok = new Map<string, { status: string; tersedia: number }>();
  if (sheetsTersambung()) {
    try {
      stok = new Map((await bacaStok()).map((s) => [s.sku, s]));
    } catch {
      /* stok tidak terbaca: tampilkan "?" */
    }
  }
  return daftar.map((p) => {
    const s = stok.get(p.sku);
    const status: KartuProduk["stok"] = !s ? "?" : s.tersedia <= 0 ? "habis" : s.status === "AMAN" ? "ada" : "sedikit";
    return { sku: p.sku, nama: namaPendek(p.nama), kategori: p.kategori, harga: p.harga, stok: status, sisa: status === "sedikit" ? s?.tersedia : undefined };
  });
}

function cariProdukDiTeks(t: string): { khusus: Produk[]; kategori: Produk[] } {
  const semua = semuaProduk();
  const khusus = semua.filter((p) => (ALIAS_SKU[p.sku] ?? []).some((k) => ada(t, k)));
  const kat = Object.entries(ALIAS_KATEGORI).filter(([, k]) => k.some((x) => ada(t, x))).map(([nama]) => nama);
  return { khusus, kategori: semua.filter((p) => kat.includes(p.kategori)) };
}

// ---------------------------------------------------------------------------
// Pesanan (wajib cocok 4 digit terakhir nomor HP)
// ---------------------------------------------------------------------------
// Nomor pesanan website/WhatsApp: awalan + "-" + angka, contoh WEB-20261116-140509-K7Q.
const POLA_NO = /\b((?:web|wa|uji)-[a-z0-9-]*\d[a-z0-9-]{4,})\b/i;

async function cekPesanan(no: string, empatDigit: string): Promise<string> {
  if (!sheetsTersambung()) return "Maaf Kak, data pesanan sedang tidak bisa dibuka (Google Sheets belum tersambung).";
  const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
  const baris = Order_Masuk.filter((r) => String(r.no_pesanan ?? "").toLowerCase() === no.toLowerCase());
  if (!baris.length) return `Pesanan ${no.toUpperCase()} tidak ditemukan, Kak 🤔 Coba cek lagi nomornya di pesan konfirmasi WhatsApp.`;
  const r0 = baris[0];
  const channel = String(r0.channel ?? "");
  if (channel === "shopee" || channel === "tiktok") {
    return `Pesanan ${r0.no_pesanan} dibuat lewat ${LABEL_CHANNEL[channel]}, Kak. Status & resinya bisa dicek langsung di aplikasi ${LABEL_CHANNEL[channel]} ya 📱`;
  }
  const hp = String(r0.no_hp_normal ?? r0.no_hp_asli ?? "").replace(/\D/g, "");
  if (!hp || hp.slice(-4) !== empatDigit) return "Maaf Kak, 4 digit nomor HP-nya tidak cocok dengan pesanan ini 🔒 Coba lagi, atau ketik “Chat admin”.";
  const st = String(r0.status_pesanan || "baru").toLowerCase();
  const tahap = ["baru", "diproses", "dikirim", "sampai", "selesai"];
  const nama = ["Order masuk", "Dikemas", "Diantar", "Sampai", "Selesai"];
  const posisi = tahap.indexOf(st);
  const total = baris.reduce((n, r) => n + (Number(r.subtotal) || 0), 0);
  const depan = String(r0.nama_pembeli ?? "").split(" ")[0];
  return [
    `🧾 Pesanan ${r0.no_pesanan}${depan ? ` atas nama ${depan}` : ""}`,
    `Status: ${LABEL_STATUS[st] ?? st}`,
    ...(r0.kurir || r0.no_resi ? [`Kurir: ${r0.kurir || "-"} · Resi: ${r0.no_resi || "-"}`] : []),
    "",
    posisi >= 0 ? nama.map((n, i) => `${i <= posisi ? "✔" : "○"} ${n}`).join("\n") : "",
    "",
    ...baris.map((r) => `• ${r.sku} × ${r.qty}`),
    `Total: ${rupiah(total)}`,
  ].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").trim();
}

// ---------------------------------------------------------------------------
// Catat pertanyaan yang belum bisa dijawab (bahan pemilik toko menambah FAQ)
// ---------------------------------------------------------------------------
async function catatTakTerjawab(pesan: string) {
  if (!sheetsTersambung()) return;
  try {
    await pastikanTab(TAB_TAK_TERJAWAB);
    const isi = await bacaMentah(TAB_TAK_TERJAWAB);
    if (!isi.length) await tulisRentang(TAB_TAK_TERJAWAB, "A1", [["id", "waktu_wib", "pertanyaan"]]);
    const waktu = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    await upsertBaris(TAB_TAK_TERJAWAB, [{ id: `CS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, waktu_wib: waktu, pertanyaan: pesan.slice(0, 300) }], "id");
  } catch {
    /* gagal mencatat tidak boleh mengganggu chat */
  }
}

// ---------------------------------------------------------------------------
// OTAK UTAMA
// ---------------------------------------------------------------------------
export async function jawabCS(input: { pesan: string; mode?: Mode; noPesanan?: string }): Promise<BalasanCS> {
  const asli = input.pesan.trim().slice(0, 500);
  const t = rapikan(asli);

  // 1a. Menunggu pesan untuk admin → teruskan ke Telegram pemilik toko.
  if (input.mode === "tunggu_admin") {
    if (ada(t, "batal") || ada(t, "tidak jadi")) return { teks: "Oke Kak, tidak jadi diteruskan. Ada lagi yang bisa dibantu? 😊", pilihan: PILIHAN_UTAMA, mode: "" };
    if (!telegramSiap()) return { teks: "Maaf Kak, saluran ke admin sedang tidak aktif. Coba lagi nanti ya 🙏", mode: "" };
    const galat = await kirimKePemilik(`💬 Pesan dari chat CS website\n\n${asli}\n\n(Balas pelanggan lewat WhatsApp kalau dia mencantumkan nomornya.)`);
    if (galat) return { teks: "Maaf Kak, pesannya gagal terkirim ke admin. Coba sekali lagi ya 🙏", mode: "tunggu_admin" };
    return { teks: "Pesan Kakak sudah diteruskan ke admin ✅\nAdmin akan membalas lewat WhatsApp di jam kerja (Senin–Sabtu, 08.00–20.00 WIB).", pilihan: PILIHAN_UTAMA, mode: "" };
  }

  // 1b. Menunggu 4 digit terakhir HP untuk cek pesanan.
  const empat = asli.replace(/\D/g, "");
  if (input.mode === "tunggu_hp" && input.noPesanan && /^\d{4}$/.test(empat)) {
    return { teks: await cekPesanan(input.noPesanan, empat), pilihan: ["Chat admin", "Ongkir & pengiriman"], mode: "" };
  }

  // 2. Ada nomor pesanan di pesan.
  const no = asli.match(POLA_NO)?.[1];
  if (no) {
    const digit = asli.replace(no, "").replace(/\D/g, "");
    if (/^\d{4}$/.test(digit)) return { teks: await cekPesanan(no, digit), pilihan: ["Chat admin"], mode: "" };
    return { teks: `Siap, Kak! Untuk keamanan, ketik 4 digit terakhir nomor HP yang dipakai saat order ${no.toUpperCase()} ya 🔒`, mode: "tunggu_hp", noPesanan: no };
  }
  if (["cek pesanan", "lacak", "resi", "status pesanan", "pesanan saya", "pesananku", "paket saya", "paketku", "order saya", "sudah sampai mana", "sampai mana"].some((k) => ada(t, k))) {
    return { teks: "Boleh, Kak 😊 Ketik nomor pesanannya ya (ada di pesan konfirmasi WhatsApp), contoh:\nWEB-20261116-140509-K7Q", mode: "" };
  }

  // 4–6. FAQ, produk, jenis kulit.
  const faq = await ambilFaq();
  const terbaik = faq.map((f) => ({ f, skor: skorKata(t, f.kata) })).filter((x) => x.skor > 0).sort((a, b) => b.skor - a.skor)[0]?.f;
  const { khusus, kategori } = cariProdukDiTeks(t);
  const kulit = KULIT.map((k) => ({ k, skor: skorKata(t, k.kata) })).filter((x) => x.skor > 0).sort((a, b) => b.skor - a.skor)[0]?.k;

  if (terbaik) {
    // FAQ menang dulu, mis. "admin online jam berapa" → jawaban jam operasional, bukan diteruskan ke admin.
    const lampiran = khusus.length ? await kartu(khusus.slice(0, 3)) : undefined;
    return { teks: terbaik.jawaban, produk: lampiran, pilihan: terbaik.pilihan, mode: "" };
  }
  // 3. Minta admin / komplain (dicek setelah FAQ).
  if (["admin", "cs", "manusia", "orang", "komplain", "complain", "keluhan", "telepon", "telpon", "hubungi"].some((k) => ada(t, k))) {
    return { teks: "Baik Kak, silakan tulis pesannya (sertakan nama & nomor WhatsApp supaya admin bisa membalas) 📝\nKetik “batal” kalau tidak jadi.", mode: "tunggu_admin" };
  }

  if (khusus.length) {
    const tanyaHarga = ["harga", "berapa", "price"].some((k) => ada(t, k));
    const tanyaStok = ["stok", "stock", "ready", "ada", "tersedia", "habis", "kosong"].some((k) => ada(t, k));
    const teks = tanyaStok ? "Ini stok terbarunya, Kak 📦" : tanyaHarga ? "Ini harganya, Kak 🏷️" : "Ini produk yang Kakak maksud 😊";
    return { teks, produk: await kartu(khusus.slice(0, 4)), pilihan: ["Cara order", "Rekomendasi untuk kulitku"], mode: "" };
  }
  if (kulit) {
    const daftar = kulit.sku.map((s) => semuaProduk().find((p) => p.sku === s)).filter((p): p is Produk => Boolean(p));
    return { teks: `Untuk kulit ${kulit.jenis}, ini rekomendasi Glowra, Kak ✨\n${kulit.tips}`, produk: await kartu(daftar), pilihan: ["Urutan pemakaian", "Cara order"], mode: "" };
  }
  if (kategori.length) {
    return { teks: `Ini pilihan ${kategori[0].kategori} Glowra, Kak 😊`, produk: await kartu(kategori.slice(0, 4)), pilihan: ["Rekomendasi untuk kulitku", "Cara order"], mode: "" };
  }
  if (["rekomendasi", "rekomen", "saran", "cocok", "jenis kulit", "kulitku", "kulit saya", "kulit"].some((k) => ada(t, k))) {
    return { teks: "Jenis kulit Kakak yang mana? 😊", pilihan: ["Kulit berminyak", "Kulit kering", "Kulit berjerawat", "Kulit sensitif", "Kulit kusam"], mode: "" };
  }
  if (["halo", "hai", "hi", "hello", "hallo", "pagi", "siang", "sore", "malam", "permisi", "assalamualaikum", "p", "kak", "min", "tes", "test"].some((k) => ada(t, k))) {
    return { teks: "Halo Kak, selamat datang di Glowra Beauty 🌸\nSaya asisten otomatis. Mau tanya apa hari ini?", pilihan: PILIHAN_UTAMA, mode: "" };
  }

  // 7. Tidak paham.
  await catatTakTerjawab(asli);
  return {
    teks: "Maaf Kak, saya belum paham pertanyaannya 🙏\nCoba pilih topik di bawah, atau ketik “Chat admin” supaya dibantu langsung oleh admin.",
    pilihan: PILIHAN_UTAMA,
    mode: "",
  };
}
