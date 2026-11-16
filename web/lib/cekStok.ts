import { sheetsTersambung } from "./sheets";
import { cekStok } from "./stok";

/**
 * Cek stok setelah ada order tercatat.
 *  - Mode n8n (N8N_CEK_STOK_URL diisi): minta workflow 06 mengecek. Tidak ditunggu, kegagalan diabaikan.
 *  - Mode Vercel: jalankan pemantau stok bawaan (lib/stok.ts). DITUNGGU, karena fungsi Vercel
 *    berhenti begitu balasan dikirim, jadi pekerjaan "di belakang" bisa terpotong.
 */
export async function pingCekStok(): Promise<void> {
  const url = process.env.N8N_CEK_STOK_URL;
  if (url) {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20_000) }).catch(() => {});
    return;
  }
  if (!sheetsTersambung()) return;
  await cekStok().catch(() => {});
}
