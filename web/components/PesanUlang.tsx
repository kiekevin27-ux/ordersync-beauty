"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useKeranjang } from "./KeranjangProvider";
import type { ItemKeranjang } from "@/lib/tipe";

/** localStorage: { no, t } = keranjang ini berasal dari link pesan ulang order `no`. */
export const KUNCI_FOLLOWUP = "glowra-followup-v1";

export default function PesanUlang({ no, items }: { no: string; items: ItemKeranjang[] }) {
  const { isiUlang } = useKeranjang();
  const router = useRouter();

  useEffect(() => {
    if (!items.length) return;
    isiUlang(items);
    try {
      localStorage.setItem(KUNCI_FOLLOWUP, JSON.stringify({ no, t: Date.now() }));
    } catch {
      /* mode privat: tetap jalan, hanya tidak tercatat sebagai follow-up */
    }
    router.replace("/checkout");
  }, [items, no, isiUlang, router]);

  if (!items.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="font-judul text-3xl font-semibold text-anggur">Pesanan tidak ditemukan</h1>
        <p className="mt-3 text-sm text-tinta-lembut">Link pesan ulang ini sudah tidak berlaku. Silakan pilih produk dari katalog ya 🙏</p>
        <Link href="/#katalog" className="tombol-utama mt-6 inline-flex">Lihat katalog</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-4xl">🛍️</p>
      <h1 className="mt-3 font-judul text-3xl font-semibold text-anggur">Menyiapkan pesanan ulang…</h1>
      <p className="mt-3 text-sm text-tinta-lembut">Keranjang diisi produk yang sama dengan pesanan sebelumnya.</p>
    </div>
  );
}
