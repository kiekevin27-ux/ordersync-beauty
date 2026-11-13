import Link from "next/link";

/**
 * Tampil kalau toko ini berjalan tanpa n8n (mis. versi online di Vercel sementara n8n masih di laptop).
 * Diatur lewat NEXT_PUBLIC_N8N_TERSAMBUNG=ya di web/.env.local saat n8n tersedia.
 */
export default function InfoModeOnline({ apa }: { apa: string }) {
  if (process.env.NEXT_PUBLIC_N8N_TERSAMBUNG === "ya") return null;
  return (
    <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="note">
      <p className="font-semibold">ℹ️ Versi online: {apa} belum tersambung ke n8n</p>
      <p className="mt-1">
        Otomasinya (n8n) saat ini berjalan di laptop pemilik demo, jadi di versi online ini order <b>tidak tercatat</b>. Kamu tetap bisa
        mencoba alurnya dan melihat penjelasannya. Data asli dari Google Sheet bisa dilihat di{" "}
        <Link href="/dashboard" className="font-semibold underline">Dashboard</Link>.
      </p>
    </div>
  );
}
