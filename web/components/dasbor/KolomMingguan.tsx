"use client";

import { useState } from "react";
import { rupiah } from "@/lib/format";

type Titik = { minggu: string; label: string; omzet: number; order: number };

const W = 720;
const H = 260;
const PAD = { atas: 28, kanan: 12, bawah: 30, kiri: 56 };

function skalaRapi(maks: number) {
  if (maks <= 0) return { atas: 1, langkah: 1 };
  const kasar = maks / 4;
  const p = 10 ** Math.floor(Math.log10(kasar));
  const langkah = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= kasar)!;
  return { atas: Math.ceil(maks / langkah) * langkah, langkah };
}
const ringkas = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : n >= 1000 ? `${Math.round(n / 1000)} rb` : String(n);

/** Kolom omzet per minggu: 1 seri, tooltip saat hover/fokus, nilai tertinggi diberi label. */
export default function KolomMingguan({ data }: { data: Titik[] }) {
  const [aktif, setAktif] = useState<number | null>(null);
  if (data.length === 0) return <p className="py-10 text-center text-sm text-tinta-lembut">Belum ada order selesai/dikirim.</p>;

  const { atas, langkah } = skalaRapi(Math.max(...data.map((d) => d.omzet)));
  const lebar = W - PAD.kiri - PAD.kanan;
  const tinggi = H - PAD.atas - PAD.bawah;
  const pita = lebar / data.length;
  const kolom = Math.min(24, pita * 0.62);
  const y = (v: number) => PAD.atas + tinggi - (v / atas) * tinggi;
  const iMaks = data.reduce((m, d, i) => (d.omzet > data[m].omzet ? i : m), 0);
  const tiap = Math.ceil(data.length / 7); // label sumbu x jarang-jarang supaya tidak bertumpuk
  const ticks = Array.from({ length: Math.round(atas / langkah) + 1 }, (_, i) => i * langkah);

  const d = aktif !== null ? data[aktif] : null;
  const xAktif = aktif !== null ? PAD.kiri + pita * aktif + pita / 2 : 0;

  return (
    <div className="relative">
      {/* Di layar sempit grafik bisa digeser ke samping supaya teks sumbu tetap terbaca */}
      <div className="-mx-2 overflow-x-auto px-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[540px]" role="img" aria-label="Omzet per minggu (order selesai dan dikirim)">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.kiri} x2={W - PAD.kanan} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.kiri - 8} y={y(v) + 4} textAnchor="end" className="fill-[var(--teks-lembut)] text-[11px]">
              {ringkas(v)}
            </text>
          </g>
        ))}
        {data.map((p, i) => {
          const x = PAD.kiri + pita * i + (pita - kolom) / 2;
          const yt = y(p.omzet);
          const h = PAD.atas + tinggi - yt;
          const r = Math.min(4, h);
          return (
            <g key={p.minggu}>
              {h > 0 && (
                <path
                  d={`M${x},${PAD.atas + tinggi} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + kolom - r} Q${x + kolom},${yt} ${x + kolom},${yt + r} V${PAD.atas + tinggi} Z`}
                  fill="var(--seri)"
                  opacity={aktif === null || aktif === i ? 1 : 0.45}
                />
              )}
              {i === iMaks && p.omzet > 0 && (
                <text x={x + kolom / 2} y={yt - 8} textAnchor="middle" className="fill-[var(--teks)] text-[11px] font-semibold">
                  {ringkas(p.omzet)}
                </text>
              )}
              {i % tiap === 0 && (
                <text x={PAD.kiri + pita * i + pita / 2} y={H - 10} textAnchor="middle" className="fill-[var(--teks-lembut)] text-[11px]">
                  {p.label}
                </text>
              )}
              {/* area sentuh selebar pita (lebih besar dari batangnya) */}
              <rect
                x={PAD.kiri + pita * i}
                y={PAD.atas}
                width={pita}
                height={tinggi}
                fill="transparent"
                tabIndex={0}
                aria-label={`Minggu ${p.label}: ${rupiah(p.omzet)}, ${p.order} order`}
                onMouseEnter={() => setAktif(i)}
                onMouseLeave={() => setAktif(null)}
                onFocus={() => setAktif(i)}
                onBlur={() => setAktif(null)}
                className="cursor-default outline-none"
              />
            </g>
          );
        })}
        <line x1={PAD.kiri} x2={W - PAD.kanan} y1={PAD.atas + tinggi} y2={PAD.atas + tinggi} stroke="var(--sumbu)" strokeWidth={1} />
      </svg>
      </div>
      {d && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl bg-tinta px-3 py-2 text-xs text-white shadow-lg"
          style={{ left: `${(xAktif / W) * 100}%` }}
        >
          <p className="font-semibold">Minggu mulai {d.label}</p>
          <p className="tabular-nums">{rupiah(d.omzet)} · {d.order} order</p>
        </div>
      )}
      <details className="mt-2 text-xs text-tinta-lembut">
        <summary className="cursor-pointer select-none hover:text-anggur">Lihat sebagai tabel</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead><tr className="border-b border-blush-tua/60"><th className="py-1">Minggu mulai</th><th>Order</th><th className="text-right">Omzet</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.minggu} className="border-b border-blush-tua/30"><td className="py-1">{p.label}</td><td>{p.order}</td><td className="text-right">{rupiah(p.omzet)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
