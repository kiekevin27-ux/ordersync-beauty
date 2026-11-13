/** Minta n8n (workflow 06) mengecek stok sekarang. Tidak ditunggu, kegagalan diabaikan. */
export function pingCekStok() {
  const url = process.env.N8N_CEK_STOK_URL;
  if (!url) return;
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20_000) }).catch(() => {});
}
