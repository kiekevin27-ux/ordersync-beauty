/**
 * PEMERIKSAAN CHECKOUT sebelum order dikirim ke gerbang order.
 *
 *  1. Jumlah tiap produk 1-20 (sama dengan batas keranjang) — keranjang bisa diakali lewat kiriman langsung.
 *  2. Stok cukup — tidak boleh membeli melebihi sisa stok (anti oversell).
 *  3. "Kirim ulang" hanya boleh untuk order yang MASIH BARU dan dengan no HP yang sama. Tanpa ini,
 *     order yang sudah dikemas bisa mundur ke "baru", dan orang lain bisa menimpa order pembeli lain
 *     hanya dengan menebak / melihat no pesanannya.
 *
 * Data yang memang rusak (nama kosong, no HP salah, qty bukan angka) TIDAK diperiksa di sini:
 * itu tugas gerbang order, supaya tombol "Kirim order rusak (uji 400)" tetap menunjukkan penolakan gerbang.
 *
 * Hasil: null = boleh lanjut, atau { http, pesan } = ditolak.
 * Kalau Google Sheets sedang tidak bisa dibaca, pemeriksaan stok dilewati (penyimpanan nanti
 * akan melaporkan galatnya sendiri) supaya toko tidak berhenti berjualan karena hal itu.
 */
import { LABEL_STATUS } from "./lacak";
import { bacaTab } from "./sheets";

export const MAKS_QTY_CHECKOUT = 20;

const hpNormal = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.startsWith("0") ? "62" + d.slice(1) : d.startsWith("8") ? "62" + d : d;
};

type Item = { sku: string; qty: unknown };
export type Penolakan = { http: 400 | 409; pesan: string };

export async function periksaCheckout(
  order: { no_pesanan: string; nama_pembeli: string; no_hp: string; items: Item[] },
  kirimUlang: boolean,
): Promise<Penolakan | null> {
  const digitHp = String(order.no_hp ?? "").replace(/\D/g, "").length;
  const qtyValid = order.items.every((it) => Number.isInteger(Number(it.qty)) && Number(it.qty) >= 1);
  if (!String(order.nama_pembeli ?? "").trim() || digitHp < 9 || digitHp > 15 || !qtyValid) return null; // biar gerbang yang menolak

  for (const it of order.items) {
    if (Number(it.qty) > MAKS_QTY_CHECKOUT) return { http: 400, pesan: `Jumlah tiap produk maksimal ${MAKS_QTY_CHECKOUT} (${it.sku})` };
  }

  let t: Record<string, Record<string, unknown>[]>;
  try {
    t = await bacaTab(["Order_Masuk", "Stok_Live"]);
  } catch {
    return null;
  }

  const lama = t.Order_Masuk.filter((r) => String(r.no_pesanan ?? "") === order.no_pesanan);
  if (lama.length) {
    const status = String(lama[0].status_pesanan || "baru").toLowerCase();
    if (!kirimUlang) return { http: 409, pesan: "No pesanan bentrok dengan order lain, silakan pesan lagi." };
    if (status !== "baru") return { http: 409, pesan: `Order ${order.no_pesanan} sudah berstatus ${LABEL_STATUS[status] ?? status}, tidak bisa dikirim ulang.` };
    if (hpNormal(lama[0].no_hp_asli || lama[0].no_hp_normal) !== hpNormal(order.no_hp)) {
      return { http: 409, pesan: "Kirim ulang hanya bisa dengan no HP yang sama dengan order aslinya." };
    }
  }

  // Stok: qty yang sudah dipesan order ini sendiri (saat kirim ulang) tidak dihitung dua kali.
  const dipesanSendiri = new Map<string, number>();
  for (const r of lama) dipesanSendiri.set(String(r.sku), (dipesanSendiri.get(String(r.sku)) ?? 0) + (Number(r.qty) || 0));
  for (const it of order.items) {
    const s = t.Stok_Live.find((r) => String(r.SKU) === it.sku);
    if (!s) continue; // produk tidak dipantau di Stok_Live → tidak dibatasi
    const sisa = (Number(s["Stok Tersedia"]) || 0) + (dipesanSendiri.get(it.sku) ?? 0);
    const nama = String(s["Nama Produk"] ?? it.sku).replace(/^Glowra\s+/, "");
    if (sisa <= 0) return { http: 409, pesan: `Maaf, ${nama} sedang habis.` };
    if (Number(it.qty) > sisa) return { http: 409, pesan: `Maaf, stok ${nama} tinggal ${sisa}. Kurangi jumlahnya ya.` };
  }
  return null;
}
