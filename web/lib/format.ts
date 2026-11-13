export const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

/** Nama produk tanpa awalan merek, untuk judul kartu: "Glowra Vitamin C..." -> "Vitamin C..." */
export const namaPendek = (nama: string) => nama.replace(/^Glowra\s+/, "");
