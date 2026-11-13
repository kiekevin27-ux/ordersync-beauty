import Link from "next/link";
import Katalog from "@/components/Katalog";
import VisualProduk from "@/components/VisualProduk";

const LANGKAH = [
  { no: "1", judul: "Kamu checkout di website", isi: "Isi nama & nomor WhatsApp. Harga dihitung ulang di server, bukan dari browser." },
  { no: "2", judul: "n8n memeriksa order", isi: "Webhook workflow 03 mengecek data wajib, format SKU, qty, dan nomor HP. Data rusak ditolak dengan alasan yang jelas." },
  { no: "3", judul: "Data dirapikan", isi: "Nomor HP jadi 628…, nama jadi Huruf Kapital, lalu keranjang dipecah: 1 produk = 1 baris." },
  { no: "4", judul: "Tercatat di Google Sheets", isi: "Masuk ke tab Order_Masuk. Order yang terkirim dua kali tidak tercatat dobel." },
];

export default function Beranda() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.25em] text-mawar">Skincare lokal · Demo</p>
            <h1 className="mt-4 font-judul text-4xl font-semibold leading-[1.05] tracking-tight text-anggur sm:text-5xl md:text-6xl">
              Kulit cerah,<br />order rapi.
            </h1>
            <p className="mt-5 max-w-md text-tinta-lembut">
              Belanja di toko demo ini, lalu lihat order kamu berjalan otomatis: diperiksa n8n dan tercatat di Google Sheets,
              tanpa admin menyalin satu baris pun.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#katalog" className="tombol-utama">Mulai belanja</Link>
              <Link href="#cara-kerja" className="tombol-garis">Lihat cara kerjanya</Link>
            </div>
          </div>
          <div className="relative mx-auto grid w-full max-w-md grid-cols-2 gap-4">
            <VisualProduk kategori="Serum" sku="GLW-SRM-002" className="rounded-3xl shadow-kartu" />
            <VisualProduk kategori="Sunscreen" sku="GLW-SNS-001" className="mt-10 rounded-3xl shadow-kartu" />
            <VisualProduk kategori="Lip Tint" sku="GLW-LTN-001" className="-mt-6 rounded-3xl shadow-kartu" />
            <VisualProduk kategori="Moisturizer" sku="GLW-MST-001" className="mt-4 rounded-3xl shadow-kartu" />
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="scroll-mt-20 bg-anggur-tua py-16 text-blush-muda">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-blush-tua">Di balik layar</p>
          <h2 className="mt-1 font-judul text-3xl font-semibold text-white">Dari klik “Pesan” sampai tercatat di sheet</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {LANGKAH.map((l) => (
              <li key={l.no} className="rounded-2xl bg-white/[.06] p-5 ring-1 ring-white/10">
                <span className="font-judul text-3xl text-mawar-muda">{l.no}</span>
                <h3 className="mt-2 font-semibold text-white">{l.judul}</h3>
                <p className="mt-2 text-sm leading-relaxed text-blush-tua/90">{l.isi}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Katalog />
    </>
  );
}
