"use client";

import Link from "next/link";
import { useKeranjang } from "./KeranjangProvider";

export default function Header() {
  const { jumlah, bukaLaci } = useKeranjang();
  return (
    <header className="sticky top-0 z-30 border-b border-blush-tua/50 bg-krem/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-judul text-2xl font-semibold tracking-tight text-anggur">Glowra</span>
          <span className="text-xs uppercase tracking-[.25em] text-tinta-lembut">Beauty</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-4">
          <Link href="/#katalog" className="hidden rounded-full px-3 py-2 text-sm text-tinta-lembut hover:text-anggur sm:block">
            Katalog
          </Link>
          <Link href="/#cara-kerja" className="hidden rounded-full px-3 py-2 text-sm text-tinta-lembut hover:text-anggur sm:block">
            Cara kerja
          </Link>
          <Link href="/simulator" className="rounded-full px-3 py-2 text-sm font-medium text-anggur hover:bg-blush-muda">
            Simulator
          </Link>
          <button
            onClick={() => bukaLaci(true)}
            className="relative flex items-center gap-2 rounded-full bg-anggur px-4 py-2 text-sm font-semibold text-white hover:bg-anggur-tua"
            aria-label={`Buka keranjang, ${jumlah} barang`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 7h12l-1 13H7L6 7Z" strokeLinejoin="round" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
            Keranjang
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs text-anggur">{jumlah}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
