import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import KeranjangProvider from "@/components/KeranjangProvider";
import Header from "@/components/Header";
import LaciKeranjang from "@/components/LaciKeranjang";
import { semuaProduk } from "@/lib/produk";

const judul = Fraunces({ subsets: ["latin"], variable: "--font-judul", display: "swap" });
const badan = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-badan", display: "swap" });

export const metadata: Metadata = {
  title: "Glowra Beauty (toko demo)",
  description: "Toko demo fiktif untuk studi kasus OrderSync Beauty: checkout langsung tercatat di Google Sheets lewat n8n.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${judul.variable} ${badan.variable}`}>
      <body className="min-h-screen bg-krem font-badan text-tinta antialiased">
        <KeranjangProvider produk={semuaProduk()}>
          <div className="bg-anggur-tua px-4 py-2 text-center text-xs text-blush">
            ⚠️ Toko <b>fiktif</b> untuk demo portofolio OrderSync Beauty. Tidak ada pembayaran atau pengiriman sungguhan.
          </div>
          <Header />
          <main>{children}</main>
          <LaciKeranjang />
          <footer className="mt-24 border-t border-blush-tua/60 px-4 py-10 text-center text-sm text-tinta-lembut">
            Glowra Beauty adalah merek fiktif · Bagian dari studi kasus <b>OrderSync Beauty</b>
          </footer>
        </KeranjangProvider>
      </body>
    </html>
  );
}
