"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useKeranjang } from "./KeranjangProvider";
import PengaturQty from "./PengaturQty";
import VisualProduk from "./VisualProduk";
import { namaPendek, rupiah } from "@/lib/format";

export default function LaciKeranjang() {
  const { isi, total, ubahQty, hapus, laciTerbuka, bukaLaci } = useKeranjang();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && bukaLaci(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [bukaLaci]);

  return (
    <div className={`fixed inset-0 z-50 ${laciTerbuka ? "" : "pointer-events-none"}`} aria-hidden={!laciTerbuka}>
      <div
        onClick={() => bukaLaci(false)}
        className={`absolute inset-0 bg-tinta/40 transition-opacity ${laciTerbuka ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-label="Keranjang belanja"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-krem shadow-2xl transition-transform duration-300 ${
          laciTerbuka ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-blush-tua/60 px-6 py-5">
          <h2 className="font-judul text-xl font-semibold text-anggur">Keranjang</h2>
          <button onClick={() => bukaLaci(false)} className="rounded-full px-3 py-1 text-2xl leading-none text-tinta-lembut hover:bg-blush-muda" aria-label="Tutup keranjang">
            ×
          </button>
        </div>

        {isi.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-tinta-lembut">
            <div>
              <p className="font-judul text-lg text-tinta">Keranjang masih kosong</p>
              <p className="mt-1 text-sm">Pilih produk dari katalog dulu, ya.</p>
            </div>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-blush-tua/50 overflow-y-auto px-6">
            {isi.map((i) => (
              <li key={i.sku} className="flex gap-4 py-4">
                <VisualProduk kategori={i.produk.kategori} sku={i.sku} className="h-20 w-20 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{namaPendek(i.produk.nama)}</p>
                  <p className="mt-0.5 font-kode text-[11px] text-tinta-lembut">{i.sku}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <PengaturQty qty={i.qty} onUbah={(q) => ubahQty(i.sku, q)} nama={i.produk.nama} />
                    <span className="text-sm font-semibold tabular-nums">{rupiah(i.qty * i.produk.harga)}</span>
                  </div>
                  <button onClick={() => hapus(i.sku)} className="mt-1 text-xs text-tinta-lembut underline-offset-2 hover:text-mawar hover:underline">
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-blush-tua/60 px-6 py-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-tinta-lembut">Total</span>
            <span className="font-judul text-2xl font-semibold tabular-nums">{rupiah(total)}</span>
          </div>
          <Link
            href="/checkout"
            onClick={() => bukaLaci(false)}
            className={`tombol-utama mt-4 w-full ${isi.length === 0 ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={isi.length === 0}
          >
            Lanjut ke checkout
          </Link>
        </div>
      </aside>
    </div>
  );
}
