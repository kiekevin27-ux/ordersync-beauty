import { readFileSync } from "node:fs";
import path from "node:path";

/** Data produk yang boleh dilihat pembeli (HPP sengaja TIDAK ikut dikirim ke browser). */
export type Produk = {
  sku: string;
  nama: string;
  kategori: string;
  harga: number;
};

// Sumber kebenaran tetap satu: data/master_produk.csv di root repo, sama dengan yang dipakai
// script Python & workbook. Website tidak punya salinan daftar produk sendiri.
const CSV_PATH = path.join(process.cwd(), "..", "data", "master_produk.csv");

let cache: Produk[] | null = null;

export function semuaProduk(): Produk[] {
  if (cache) return cache;
  const teks = readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, ""); // buang BOM
  const [header, ...baris] = teks.trim().split(/\r?\n/);
  const kolom = header.split(",");
  const idx = (k: string) => kolom.indexOf(k);
  cache = baris.map((b) => {
    const f = b.split(","); // CSV ini tidak memakai tanda kutip/koma di dalam nilai
    return {
      sku: f[idx("sku")],
      nama: f[idx("nama_produk")],
      kategori: f[idx("kategori")],
      harga: Number(f[idx("harga_jual")]),
    };
  });
  return cache;
}

export function cariProduk(sku: string): Produk | undefined {
  return semuaProduk().find((p) => p.sku === sku);
}
