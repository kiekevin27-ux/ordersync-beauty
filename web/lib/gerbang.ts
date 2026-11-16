/**
 * GERBANG ORDER versi Vercel = terjemahan workflow n8n 03 ke TypeScript.
 *
 * Semua order (toko, simulator marketplace, bot) masuk lewat sini:
 *   validasi → rapikan & pecah per produk → upsert ke tab Order_Masuk → balasan.
 * Aturannya SENGAJA dibuat sama persis dengan node "Validasi Order", "Normalisasi Data", dan
 * "Rangkum Hasil" di scripts/build_workflow_03.py, supaya hasil di sheet tidak berbeda apa pun
 * mesinnya (n8n di laptop atau Vercel).
 */
import { kabariPerubahanStatus } from "./lacak";
import { upsertBaris } from "./sheets";

const WAJIB = ["channel", "no_pesanan", "nama_pembeli"];
const CHANNEL_DIKENAL = ["shopee", "tiktok", "whatsapp", "website"];
const CHANNEL_MARKETPLACE = ["shopee", "tiktok"]; // API marketplace sering menyamarkan no HP
const STATUS_PESANAN = ["baru", "diproses", "dikirim", "sampai", "selesai", "batal", "retur"];
const POLA_SKU = /^GLW-[A-Z]{3}-\d{3}$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/;
const MAKS_PRODUK = 30;
const MAKS_QTY = 999; // jaga-jaga angka tidak masuk akal (mis. 1000000) dari kiriman langsung
const MAKS_ORDER = 2000;

type Obj = Record<string, unknown>;
const kosong = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

/** Waktu sekarang dalam WIB: "2026-11-16 14:05:09". */
export function waktuWib(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
}

function cekOrder(body: Obj) {
  const errors: string[] = [];
  for (const f of WAJIB) if (kosong(body[f])) errors.push(`Field '${f}' wajib diisi`);
  const channel = kosong(body.channel) ? "" : String(body.channel).trim().toLowerCase();
  if (channel && !CHANNEL_DIKENAL.includes(channel)) {
    errors.push(`Field 'channel' harus salah satu dari: ${CHANNEL_DIKENAL.join(", ")}`);
  }
  const marketplace = CHANNEL_MARKETPLACE.includes(channel);

  if (kosong(body.no_hp)) {
    if (!marketplace) errors.push("Field 'no_hp' wajib diisi");
  } else if (String(body.no_hp).includes("*")) {
    if (!marketplace) errors.push("Field 'no_hp' tidak boleh disamarkan untuk channel ini");
  } else {
    const digit = String(body.no_hp).replace(/\D/g, "");
    if (digit.length < 9 || digit.length > 15) errors.push("Field 'no_hp' harus berisi 9-15 digit angka");
  }

  if (!kosong(body.status_pesanan) && !STATUS_PESANAN.includes(String(body.status_pesanan).trim().toLowerCase())) {
    errors.push(`Field 'status_pesanan' harus salah satu dari: ${STATUS_PESANAN.join(", ")}`);
  }
  if (!kosong(body.tanggal_pesanan) && !POLA_TANGGAL.test(String(body.tanggal_pesanan).trim())) {
    errors.push("Field 'tanggal_pesanan' harus berformat YYYY-MM-DD atau YYYY-MM-DD HH:mm");
  }

  for (const f of ["kurir", "no_resi"]) {
    if (!kosong(body[f]) && String(body[f]).trim().length > 40) errors.push(`Field '${f}' maksimal 40 karakter`);
  }

  let items: Obj[] = [];
  if (Array.isArray(body.items)) items = body.items as Obj[];
  else if (!kosong(body.sku) || !kosong(body.qty)) items = [{ sku: body.sku, qty: body.qty }];

  if (items.length === 0) errors.push("Order harus berisi minimal 1 produk (field 'items', atau 'sku' + 'qty')");
  if (items.length > MAKS_PRODUK) errors.push(`Maksimal ${MAKS_PRODUK} produk per order`);

  const skuTerlihat = new Set<string>();
  items.forEach((it, i) => {
    const label = items.length > 1 ? `Produk #${i + 1}: ` : "";
    it = it || {};
    if (kosong(it.sku)) {
      errors.push(`${label}Field 'sku' wajib diisi`);
    } else {
      const sku = String(it.sku).trim().toUpperCase();
      if (!POLA_SKU.test(sku)) errors.push(`${label}Field 'sku' harus berformat GLW-XXX-000 (contoh: GLW-SRM-001)`);
      if (skuTerlihat.has(sku)) errors.push(`${label}SKU ${sku} muncul dua kali, gabungkan qty-nya`);
      skuTerlihat.add(sku);
    }
    if (kosong(it.qty)) {
      errors.push(`${label}Field 'qty' wajib diisi`);
    } else {
      const qty = Number(it.qty);
      if (!Number.isInteger(qty) || qty <= 0) errors.push(`${label}Field 'qty' harus angka bulat lebih dari 0`);
      else if (qty > MAKS_QTY) errors.push(`${label}Field 'qty' maksimal ${MAKS_QTY}`);
    }
    if (!kosong(it.harga_satuan)) {
      const h = Number(it.harga_satuan);
      if (!Number.isInteger(h) || h < 0) errors.push(`${label}Field 'harga_satuan' harus angka bulat (rupiah)`);
    }
  });
  return { errors, order: { ...body, items } };
}

type Baris = {
  diterima_pada_wib: string; id_baris: string; channel: string; no_pesanan: string; sku: string; qty: number;
  harga_satuan: number | ""; subtotal: number | ""; nama_pembeli: string; no_hp_normal: string; no_hp_asli: string;
  status: string; catatan: string; status_pesanan: string; tanggal_pesanan: string;
  // Opsional: hanya ditulis kalau dikirim, supaya resi yang sudah tercatat tidak terhapus oleh update status lain.
  kurir?: string; no_resi?: string;
};

/** Rapikan order lalu pecah jadi 1 baris per produk (aturan sama dengan scripts/clean_merge.py). */
function normalisasi(o: Obj & { items: Obj[] }, wib: string): Baris[] {
  const hpAsli = kosong(o.no_hp) ? "" : String(o.no_hp);
  const disamarkan = hpAsli === "" || hpAsli.includes("*");
  let hp = "";
  let hpValid = false;
  if (!disamarkan) {
    hp = hpAsli.replace(/\D/g, "");
    if (hp.startsWith("0")) hp = "62" + hp.slice(1);
    else if (hp.startsWith("8")) hp = "62" + hp;
    hpValid = hp.startsWith("628") && hp.length >= 11 && hp.length <= 14;
  }
  let status = "diterima";
  let catatan = "Order diterima dan siap diproses";
  if (disamarkan) {
    catatan = "No HP tidak tersedia/disamarkan oleh marketplace (normal untuk data API)";
  } else if (!hpValid) {
    status = "perlu_cek";
    catatan = "Nomor HP bukan nomor Indonesia (628...). Mohon cek manual.";
  }
  const nama = String(o.nama_pembeli)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(kak|ka|kk)\s+/i, "")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const noPesanan = String(o.no_pesanan).trim();
  const statusPesanan = kosong(o.status_pesanan) ? "baru" : String(o.status_pesanan).trim().toLowerCase();
  const tanggalPesanan = kosong(o.tanggal_pesanan) ? wib.slice(0, 16) : String(o.tanggal_pesanan).trim();

  const lacak: Pick<Baris, "kurir" | "no_resi"> = {};
  if (!kosong(o.kurir)) lacak.kurir = String(o.kurir).trim();
  if (!kosong(o.no_resi)) lacak.no_resi = String(o.no_resi).trim();

  return o.items.map((it) => {
    const sku = String(it.sku).trim().toUpperCase();
    const qty = Number(it.qty);
    const harga: number | "" = kosong(it.harga_satuan) ? "" : Number(it.harga_satuan);
    return {
      diterima_pada_wib: wib,
      id_baris: `${noPesanan}|${sku}`,
      channel: String(o.channel).trim().toLowerCase(),
      no_pesanan: noPesanan,
      sku,
      qty,
      harga_satuan: harga,
      subtotal: harga === "" ? "" : harga * qty,
      nama_pembeli: nama,
      no_hp_normal: hp,
      no_hp_asli: hpAsli,
      status,
      catatan,
      status_pesanan: statusPesanan,
      tanggal_pesanan: tanggalPesanan,
      ...lacak,
    };
  });
}

export type HasilGerbang = { http: 200 | 400 | 500; balasan: Obj };

/** Proses 1 order, atau banyak order sekaligus ({ orders: [...] }). Balasan sama dengan workflow 03. */
export async function prosesOrder(body: Obj): Promise<HasilGerbang> {
  const batch = Array.isArray(body.orders);
  const daftar = (batch ? body.orders : [body]) as Obj[];
  if (batch && (daftar.length === 0 || daftar.length > MAKS_ORDER)) {
    const pesan = daftar.length === 0 ? "Field 'orders' tidak boleh kosong" : `Maksimal ${MAKS_ORDER} order per kiriman`;
    return { http: 400, balasan: { status: "ditolak", pesan: "Data order tidak lengkap atau tidak valid", errors: [pesan], ditolak: [] } };
  }

  // ---- Validasi ----
  const valid: (Obj & { items: Obj[] })[] = [];
  const ditolak: { urutan: number; no_pesanan: string | null; errors: string[] }[] = [];
  const noTerlihat = new Set<string>();
  daftar.forEach((o, i) => {
    const { errors, order } = cekOrder(o || {});
    const no = kosong(o?.no_pesanan) ? null : String(o.no_pesanan).trim();
    if (no && noTerlihat.has(no)) errors.push(`no_pesanan ${no} muncul dua kali dalam kiriman ini, gabungkan produknya`);
    if (no) noTerlihat.add(no);
    if (errors.length) ditolak.push({ urutan: i + 1, no_pesanan: no, errors });
    else valid.push(order);
  });
  if (valid.length === 0) {
    const errors = batch
      ? ditolak.slice(0, 20).flatMap((d) => d.errors.map((e) => `Order #${d.urutan}${d.no_pesanan ? ` (${d.no_pesanan})` : ""}: ${e}`))
      : ditolak[0].errors;
    return { http: 400, balasan: { status: "ditolak", pesan: "Data order tidak lengkap atau tidak valid", errors, ditolak: ditolak.slice(0, 100) } };
  }

  // ---- Normalisasi + tulis ke Google Sheets ----
  const wib = waktuWib();
  const baris = valid.flatMap((o) => normalisasi(o, wib));
  let detail: string | null = null;
  let sebelum: Record<string, unknown>[] = [];
  try {
    sebelum = (await upsertBaris("Order_Masuk", baris, "id_baris")).sebelum;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  const tersimpan = detail === null;
  const PESAN_GAGAL = "Order valid, tetapi gagal ditulis ke Google Sheets. Coba kirim ulang atau cek kredensial/URL sheet.";

  if (batch) {
    const jumlahOrder = new Set(baris.map((b) => b.no_pesanan)).size;
    let status = "diterima";
    let pesan = `${jumlahOrder} order (${baris.length} baris) tercatat di Google Sheets`;
    if (!tersimpan) { status = "gagal_simpan"; pesan = PESAN_GAGAL; }
    else if (ditolak.length) { status = "diterima_sebagian"; pesan += `, ${ditolak.length} order ditolak`; }
    return { http: tersimpan ? 200 : 500, balasan: {
      status, pesan, mode: "batch", jumlah_order: jumlahOrder, jumlah_baris: baris.length, jumlah_ditolak: ditolak.length,
      ditolak: ditolak.slice(0, 100), total: baris.reduce((s, b) => s + (typeof b.subtotal === "number" ? b.subtotal : 0), 0),
      diterima_pada_wib: wib, tersimpan_di_sheet: tersimpan, detail_error: detail,
    } };
  }

  const r = baris[0];
  // Pelacakan: kabari pemilik toko di Telegram kalau ini order baru atau statusnya berubah.
  const notifikasiStatus = tersimpan ? await kabariPerubahanStatus(baris, sebelum).catch((e) => `gagal_kirim: ${e}`) : null;
  const semuaBerharga = baris.every((b) => b.subtotal !== "");
  let status = "diterima";
  let pesan = "Order diterima dan sudah tercatat di Google Sheets";
  if (!tersimpan) { status = "gagal_simpan"; pesan = PESAN_GAGAL; }
  else if (baris.some((b) => b.status === "perlu_cek")) {
    status = "perlu_cek";
    pesan = "Order tercatat, tetapi nomor HP bukan nomor Indonesia (628...). Admin perlu cek manual.";
  }
  return { http: tersimpan ? 200 : 500, balasan: {
    status, pesan,
    no_pesanan: r.no_pesanan, channel: r.channel, nama_pembeli: r.nama_pembeli, no_hp_normal: r.no_hp_normal,
    status_pesanan: r.status_pesanan, tanggal_pesanan: r.tanggal_pesanan,
    kurir: r.kurir ?? null, no_resi: r.no_resi ?? null, notifikasi_status: notifikasiStatus,
    jumlah_produk: baris.length,
    total_qty: baris.reduce((s, b) => s + b.qty, 0),
    total: semuaBerharga ? baris.reduce((s, b) => s + (b.subtotal as number), 0) : null,
    items: baris.map((b) => ({ sku: b.sku, qty: b.qty, harga_satuan: b.harga_satuan, subtotal: b.subtotal })),
    diterima_pada_wib: wib, tersimpan_di_sheet: tersimpan, detail_error: detail,
  } };
}
