"use client";

import { useMemo, useState } from "react";
import { useKeranjang } from "./KeranjangProvider";
import VisualProduk from "./VisualProduk";
import { namaPendek, rupiah } from "@/lib/format";

export default function Katalog() {
  const { produk, tambah, isi } = useKeranjang();
  const kategori = useMemo(() => ["Semua", ...Array.from(new Set(produk.map((p) => p.kategori)))], [produk]);
  const [pilih, setPilih] = useState("Semua");
  const [baruDitambah, setBaruDitambah] = useState<string | null>(null);
  const tampil = pilih === "Semua" ? produk : produk.filter((p) => p.kategori === pilih);

  const klikTambah = (sku: string) => {
    tambah(sku);
    setBaruDitambah(sku);
    setTimeout(() => setBaruDitambah((s) => (s === sku ? null : s)), 1200);
  };

  return (
    <section id="katalog" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-mawar">Katalog</p>
          <h2 className="mt-1 font-judul text-3xl font-semibold">15 produk, satu rutinitas</h2>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-end sm:px-0">
          {kategori.map((k) => (
            <button
              key={k}
              onClick={() => setPilih(k)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                pilih === k ? "bg-anggur text-white" : "bg-white text-tinta-lembut ring-1 ring-blush-tua hover:text-anggur"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {tampil.map((p) => {
          const diKeranjang = isi.find((i) => i.sku === p.sku)?.qty ?? 0;
          return (
            <li key={p.sku} className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-kartu">
              <div className="relative">
                <VisualProduk kategori={p.kategori} sku={p.sku} className="aspect-square w-full transition duration-500 group-hover:scale-[1.03]" />
                <span className="absolute left-3 top-3 rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-medium text-tinta-lembut">
                  {p.kategori}
                </span>
                {diKeranjang > 0 && (
                  <span className="absolute right-3 top-3 rounded-full bg-anggur px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {diKeranjang} di keranjang
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="text-sm font-semibold leading-snug sm:text-[15px]">{namaPendek(p.nama)}</h3>
                <p className="mt-1 font-kode text-[11px] text-tinta-lembut">{p.sku}</p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <span className="font-semibold tabular-nums">{rupiah(p.harga)}</span>
                  <button
                    onClick={() => klikTambah(p.sku)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                      baruDitambah === p.sku ? "bg-emerald-600 text-white" : "bg-blush text-anggur hover:bg-anggur hover:text-white"
                    }`}
                  >
                    {baruDitambah === p.sku ? "✓ Masuk" : "+ Keranjang"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
