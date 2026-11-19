import type { Metadata } from "next";
import PesanUlang from "@/components/PesanUlang";
import { cariProduk } from "@/lib/produk";
import { bacaTab, sheetsTersambung } from "@/lib/sheets";

/**
 * /pesan-ulang/<no pesanan> — link di pesan WhatsApp "pengingat beli ulang".
 * Membaca produk & qty order lama dari Google Sheet, mengisi keranjang, lalu membuka checkout.
 * Hanya SKU & qty yang dikirim ke browser (nama/no HP pembeli tidak ikut).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesan ulang · Glowra Beauty (toko demo)", robots: { index: false } };

export default async function HalamanPesanUlang({ params }: { params: { no: string } }) {
  const no = decodeURIComponent(params.no ?? "");
  let items: { sku: string; qty: number }[] = [];
  if (sheetsTersambung() && /^[A-Za-z0-9-]{4,40}$/.test(no)) {
    try {
      const { Order_Masuk } = await bacaTab(["Order_Masuk"]);
      items = Order_Masuk.filter((r) => String(r.no_pesanan ?? "") === no)
        .map((r) => ({ sku: String(r.sku), qty: Number(r.qty) || 1 }))
        .filter((i) => cariProduk(i.sku));
    } catch {
      items = [];
    }
  }
  return <PesanUlang no={no} items={items} />;
}
