"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Produk } from "@/lib/produk";
import type { ItemKeranjang } from "@/lib/tipe";

const KUNCI = "glowra-keranjang-v1";
const MAKS_QTY = 20;

type BarisKeranjang = ItemKeranjang & { produk: Produk };

type NilaiKeranjang = {
  produk: Produk[];
  isi: BarisKeranjang[];
  jumlah: number;
  total: number;
  tambah: (sku: string) => void;
  ubahQty: (sku: string, qty: number) => void;
  hapus: (sku: string) => void;
  kosongkan: () => void;
  laciTerbuka: boolean;
  bukaLaci: (v: boolean) => void;
};

const Ctx = createContext<NilaiKeranjang | null>(null);

export function useKeranjang() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeranjang harus dipakai di dalam <KeranjangProvider>");
  return v;
}

export default function KeranjangProvider({ produk, children }: { produk: Produk[]; children: React.ReactNode }) {
  const [items, setItems] = useState<ItemKeranjang[]>([]);
  const [siap, setSiap] = useState(false);
  const [laciTerbuka, bukaLaci] = useState(false);

  // Keranjang disimpan di browser supaya tidak hilang saat halaman di-refresh.
  useEffect(() => {
    try {
      const s = localStorage.getItem(KUNCI);
      if (s) setItems(JSON.parse(s));
    } catch {
      /* mode privat / storage diblokir: keranjang tetap jalan, hanya tidak diingat */
    }
    setSiap(true);
  }, []);

  useEffect(() => {
    if (!siap) return;
    try {
      localStorage.setItem(KUNCI, JSON.stringify(items));
    } catch {
      /* abaikan */
    }
  }, [items, siap]);

  const tambah = useCallback((sku: string) => {
    setItems((lama) => {
      const ada = lama.find((i) => i.sku === sku);
      if (ada) return lama.map((i) => (i.sku === sku ? { ...i, qty: Math.min(i.qty + 1, MAKS_QTY) } : i));
      return [...lama, { sku, qty: 1 }];
    });
  }, []);

  const ubahQty = useCallback((sku: string, qty: number) => {
    setItems((lama) =>
      qty <= 0 ? lama.filter((i) => i.sku !== sku) : lama.map((i) => (i.sku === sku ? { ...i, qty: Math.min(qty, MAKS_QTY) } : i)),
    );
  }, []);

  const hapus = useCallback((sku: string) => setItems((lama) => lama.filter((i) => i.sku !== sku)), []);
  const kosongkan = useCallback(() => setItems([]), []);

  const nilai = useMemo<NilaiKeranjang>(() => {
    const isi = items
      .map((i) => ({ ...i, produk: produk.find((p) => p.sku === i.sku)! }))
      .filter((i) => i.produk); // buang SKU lama yang sudah tidak ada di master
    return {
      produk,
      isi,
      jumlah: isi.reduce((s, i) => s + i.qty, 0),
      total: isi.reduce((s, i) => s + i.qty * i.produk.harga, 0),
      tambah, ubahQty, hapus, kosongkan, laciTerbuka, bukaLaci,
    };
  }, [items, produk, tambah, ubahQty, hapus, kosongkan, laciTerbuka]);

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}
