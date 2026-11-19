/**
 * SIKLUS PAKAI PRODUK — berapa hari 1 produk benar-benar habis dipakai pelanggan.
 *
 * Angka yang DIPAKAI follow-up ada di tab "Lama_Pakai" (dibuat otomatis dari perkiraan awal di
 * data/master_produk.csv). Pemilik toko boleh mengubahnya langsung di Google Sheet, atau menekan
 * "Terapkan saran" di dashboard.
 *
 * Data nyata dihitung dari jarak pembelian ulang di tab Order_Masuk:
 *   pelanggan yang sama (no HP) membeli produk yang sama lagi →
 *   (tanggal beli berikutnya − tanggal beli sebelumnya) ÷ qty pembelian sebelumnya = hari per pcs
 * Diambil MEDIAN (nilai tengah) supaya tidak terpengaruh pembeli yang menimbun / menghadiahkan.
 * Jarak < 3 hari atau > 180 hari diabaikan (kemungkinan salah input / sempat pindah merek).
 * Saran baru muncul kalau ada minimal DATA_MINIMAL data dan bedanya ≥ 15% dari angka yang dipakai.
 * Pembeli marketplace dengan no HP disamarkan tidak bisa dilacak.
 */
import { waktuWib } from "./gerbang";
import { semuaProduk } from "./produk";
import { bacaTab, pastikanTab, tulisRentang, upsertBaris } from "./sheets";

export const TAB_LAMA = "Lama_Pakai";
export const DATA_MINIMAL = 5;
const BEDA_MINIMAL = 0.15;

const tgl = (v: unknown) =>
  typeof v === "number" ? new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10) : String(v ?? "").slice(0, 10);

/** Angka lama pakai yang dipakai follow-up: tab Lama_Pakai, atau perkiraan awal kalau belum ada. */
export async function bacaLamaPakai(): Promise<Map<string, number>> {
  const hasil = new Map(semuaProduk().map((p) => [p.sku, p.lama_pakai_hari]));
  let isi: Record<string, unknown>[];
  try {
    isi = (await bacaTab([TAB_LAMA]))[TAB_LAMA];
  } catch (e) {
    if (!/Unable to parse range/i.test(String(e))) throw e;
    await pastikanTab(TAB_LAMA);
    await tulisRentang(TAB_LAMA, "A1", [
      ["sku", "nama_produk", "lama_pakai_hari", "diperbarui_wib", "catatan"],
      ...semuaProduk().map((p) => [p.sku, p.nama, p.lama_pakai_hari, waktuWib(), "perkiraan awal"]),
    ]);
    return hasil;
  }
  for (const r of isi) {
    const n = Number(r.lama_pakai_hari);
    if (hasil.has(String(r.sku)) && Number.isFinite(n) && n >= 1) hasil.set(String(r.sku), Math.round(n));
  }
  return hasil;
}

export type BarisSiklus = {
  sku: string; nama: string; dipakai: number; nyata: number | null; jumlahData: number;
  saran: number | null; status: "ubah" | "pas" | "kurang_data";
};

export async function hitungSiklus(): Promise<BarisSiklus[]> {
  const [{ Order_Masuk }, lama] = await Promise.all([bacaTab(["Order_Masuk"]), bacaLamaPakai()]);
  // pembelian per pelanggan + produk (1 order bisa punya beberapa baris produk berbeda)
  const beli = new Map<string, { t: string; qty: number; no: string }[]>();
  for (const r of Order_Masuk) {
    if (String(r.status_pesanan).toLowerCase() === "batal") continue;
    const hp = String(r.no_hp_normal ?? "");
    if (!/^628\d{8,11}$/.test(hp)) continue;
    const t = tgl(r.tanggal_pesanan || r.diterima_pada_wib);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) continue;
    const k = `${hp}|${r.sku}`;
    const a = beli.get(k) ?? [];
    a.push({ t, qty: Number(r.qty) || 1, no: String(r.no_pesanan) });
    beli.set(k, a);
  }
  const jarak = new Map<string, number[]>();
  for (const [k, a] of beli) {
    a.sort((x, y) => x.t.localeCompare(y.t));
    for (let i = 1; i < a.length; i++) {
      if (a[i].no === a[i - 1].no) continue;
      const hari = (Date.parse(a[i].t) - Date.parse(a[i - 1].t)) / 86400_000 / a[i - 1].qty;
      if (hari < 3 || hari > 180) continue;
      const sku = k.split("|")[1];
      jarak.set(sku, [...(jarak.get(sku) ?? []), hari]);
    }
  }
  return semuaProduk().map((p) => {
    const d = (jarak.get(p.sku) ?? []).sort((a, b) => a - b);
    const dipakai = lama.get(p.sku) ?? p.lama_pakai_hari;
    const nyata = d.length ? Math.round(d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2) : null;
    const cukup = d.length >= DATA_MINIMAL && nyata !== null;
    const beda = cukup && Math.abs(nyata - dipakai) / dipakai >= BEDA_MINIMAL;
    return {
      sku: p.sku, nama: p.nama, dipakai, nyata, jumlahData: d.length,
      saran: beda ? nyata : null,
      status: !cukup ? "kurang_data" : beda ? "ubah" : "pas",
    };
  });
}

/** Ubah angka lama pakai 1 produk di tab Lama_Pakai (tombol "Terapkan saran"). */
export async function terapkan(sku: string, hari: number, oleh = "dashboard"): Promise<{ ok: boolean; pesan: string }> {
  const p = semuaProduk().find((x) => x.sku === sku);
  if (!p) return { ok: false, pesan: `Produk ${sku} tidak ditemukan` };
  if (!Number.isInteger(hari) || hari < 3 || hari > 365) return { ok: false, pesan: "Lama pakai harus 3–365 hari" };
  await bacaLamaPakai(); // pastikan tab ada
  await upsertBaris(TAB_LAMA, [{ sku, nama_produk: p.nama, lama_pakai_hari: hari, diperbarui_wib: waktuWib(), catatan: `diterapkan dari data nyata (${oleh})` }], "sku");
  return { ok: true, pesan: `Lama pakai ${p.nama.replace(/^Glowra\s+/, "")} sekarang ${hari} hari. Jadwal pengingat beli ulang ikut menyesuaikan.` };
}
