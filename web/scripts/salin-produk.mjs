// Salin ../data/master_produk.csv (sumber kebenaran) -> lib/produk.generated.json.
// Dijalankan otomatis sebelum `npm run dev` / `npm run build`. Kalau CSV induk tidak ada
// (mis. server build yang hanya berisi folder web/), file JSON yang sudah di-commit dipakai.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const csv = new URL("../../data/master_produk.csv", import.meta.url);
const out = new URL("../lib/produk.generated.json", import.meta.url);
if (!existsSync(csv)) {
  console.log("master_produk.csv tidak ditemukan, memakai lib/produk.generated.json yang ada");
  process.exit(0);
}
const teks = readFileSync(csv, "utf8").replace(/^﻿/, "").trim();
const [header, ...baris] = teks.split(/\r?\n/);
const kol = header.split(",");
const i = (k) => kol.indexOf(k);
const produk = baris.map((b) => {
  const f = b.split(","); // CSV ini tidak memakai tanda kutip/koma di dalam nilai
  return { sku: f[i("sku")], nama: f[i("nama_produk")], kategori: f[i("kategori")], harga: Number(f[i("harga_jual")]) };
});
writeFileSync(out, JSON.stringify(produk, null, 2) + "\n");
console.log(`produk.generated.json: ${produk.length} produk`);
