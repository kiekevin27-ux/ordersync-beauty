import data from "./produk.generated.json";

/** Data produk yang boleh dilihat pembeli (HPP sengaja TIDAK ikut). */
export type Produk = {
  sku: string;
  nama: string;
  kategori: string;
  harga: number;
};

// Sumber kebenaran tetap data/master_produk.csv di root repo (dipakai juga script Python & workbook).
// File JSON ini dibuat otomatis oleh web/scripts/salin-produk.mjs sebelum dev/build.
const produk: Produk[] = data;

export function semuaProduk(): Produk[] {
  return produk;
}

export function cariProduk(sku: string): Produk | undefined {
  return produk.find((p) => p.sku === sku);
}
