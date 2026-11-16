/**
 * Mesin otomasi yang sedang dipakai, untuk teks di layar.
 *   NEXT_PUBLIC_MESIN_OTOMASI=vercel → logika workflow berjalan di server Vercel (lib/gerbang.ts, dll.)
 *   selain itu                       → n8n (laptop)
 */
export const MESIN_VERCEL = process.env.NEXT_PUBLIC_MESIN_OTOMASI === "vercel";

/** Nama pendek mesin untuk kalimat: "dirapikan n8n" / "dirapikan robot". */
export const NAMA_MESIN = MESIN_VERCEL ? "robot otomasi" : "n8n";
