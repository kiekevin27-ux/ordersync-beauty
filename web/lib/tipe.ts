/** Isi keranjang yang dikirim browser ke /api/checkout. Harga TIDAK dikirim dari browser. */
export type ItemKeranjang = { sku: string; qty: number };

export type PermintaanCheckout = {
  nama_pembeli: string;
  no_hp: string;
  items: ItemKeranjang[];
  /** Diisi hanya saat "kirim ulang" untuk demo anti-dobel. */
  no_pesanan?: string;
};

/** Balasan /api/checkout ke browser: hasil n8n + data mentah untuk panel "di balik layar". */
export type HasilCheckout = {
  /** "tersimpan" (200), "ditolak" (400), "gagal_simpan" (500), "tidak_terhubung" (n8n mati/salah alamat) */
  hasil: "tersimpan" | "ditolak" | "gagal_simpan" | "tidak_terhubung" | "salah_input";
  http_status: number | null;
  pesan: string;
  dikirim: Record<string, unknown> | null;
  diterima: Record<string, unknown> | null;
  webhook_url: string | null;
  durasi_ms: number | null;
};
