"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BarisSiklus } from "@/lib/siklus";

const LENCANA: Record<BarisSiklus["status"], { teks: string; kelas: string }> = {
  ubah: { teks: "! Perlu diubah", kelas: "bg-[#fab219]/15 text-[#7a5200] ring-[#fab219]/60" },
  pas: { teks: "✓ Sudah pas", kelas: "bg-[#0ca30c]/10 text-[#0b6b0b] ring-[#0ca30c]/40" },
  kurang_data: { teks: "Data belum cukup", kelas: "bg-blush-muda text-tinta-lembut ring-blush-tua/60" },
};

export default function SiklusPakai({ data, minimal }: { data: BarisSiklus[]; minimal: number }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  async function terapkan(sku: string, hari: number) {
    setSibuk(sku);
    setPesan(null);
    try {
      const r = await fetch("/api/siklus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, hari }) });
      const j = await r.json();
      setPesan({ ok: Boolean(j.ok), teks: j.pesan ?? "Selesai" });
      if (j.ok) router.refresh();
    } catch {
      setPesan({ ok: false, teks: "Server tidak merespons." });
    } finally {
      setSibuk(null);
    }
  }

  // yang perlu diubah di atas, lalu yang datanya paling banyak
  const urut = [...data].sort((a, b) => Number(b.status === "ubah") - Number(a.status === "ubah") || b.jumlahData - a.jumlahData);

  return (
    <div>
      {pesan && (
        <p role="status" className={`mb-4 rounded-2xl border p-3 text-sm ${pesan.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-mawar/40 bg-blush-muda text-anggur-tua"}`}>
          {pesan.ok ? "✓ " : "✕ "}
          {pesan.teks}
        </p>
      )}
      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-blush-tua/60 text-xs text-tinta-lembut">
              <th className="py-2 font-medium">Produk</th>
              <th className="py-2 text-right font-medium">Dipakai sekarang</th>
              <th className="py-2 text-right font-medium">Data nyata (median)</th>
              <th className="py-2 text-right font-medium">Jumlah data</th>
              <th className="py-2 pl-4 font-medium">Saran</th>
            </tr>
          </thead>
          <tbody>
            {urut.map((s) => {
              const l = LENCANA[s.status];
              return (
                <tr key={s.sku} className="border-b border-blush-tua/30">
                  <td className="py-2.5 pr-3">
                    <p className="leading-snug">{s.nama.replace(/^Glowra\s+/, "")}</p>
                    <p className="font-kode text-[11px] text-tinta-lembut">{s.sku}</p>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{s.dipakai} hari</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{s.nyata === null ? "–" : `${s.nyata} hari`}</td>
                  <td className="py-2.5 text-right tabular-nums text-tinta-lembut">
                    {s.jumlahData}
                    {s.jumlahData < minimal && <span className="text-[11px]"> / {minimal}</span>}
                  </td>
                  <td className="py-2.5 pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${l.kelas}`}>{l.teks}</span>
                      {s.saran !== null && (
                        <button className="tombol-garis !px-3 !py-1 !text-xs" disabled={!!sibuk} onClick={() => terapkan(s.sku, s.saran!)}>
                          {sibuk === s.sku ? "…" : `Terapkan ${s.saran} hari`}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
