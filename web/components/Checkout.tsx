"use client";

import Link from "next/link";
import { useState } from "react";
import { useKeranjang } from "./KeranjangProvider";
import PengaturQty from "./PengaturQty";
import VisualProduk from "./VisualProduk";
import BalikLayar, { langkahCheckout } from "./BalikLayar";
import { namaPendek, rupiah } from "@/lib/format";
import type { HasilCheckout, PermintaanCheckout } from "@/lib/tipe";

const SHEET_URL = process.env.NEXT_PUBLIC_SHEET_URL;

const JUDUL: Record<HasilCheckout["hasil"], { judul: string; warna: string }> = {
  tersimpan: { judul: "Order tercatat di Google Sheets 🎉", warna: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  ditolak: { judul: "Order ditolak oleh n8n (400)", warna: "border-amber-300 bg-amber-50 text-amber-900" },
  gagal_simpan: { judul: "Order valid, tapi gagal ditulis ke Google Sheets (500)", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
  tidak_terhubung: { judul: "Website tidak bisa menghubungi n8n", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
  salah_input: { judul: "Permintaan tidak valid", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
};

type BalasanN8n = {
  status?: string;
  no_pesanan?: string;
  nama_pembeli?: string;
  no_hp_normal?: string;
  total?: number | null;
  errors?: string[];
  detail_error?: string | null;
  items?: { sku: string; qty: number; subtotal: number | "" }[];
};

export default function Checkout() {
  const { isi, total, ubahQty, kosongkan } = useKeranjang();
  const [nama, setNama] = useState("");
  const [hp, setHp] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [hasil, setHasil] = useState<HasilCheckout | null>(null);
  const [terakhir, setTerakhir] = useState<PermintaanCheckout | null>(null);
  const [kirimUlang, setKirimUlang] = useState(false);

  async function kirim(req: PermintaanCheckout) {
    setMengirim(true);
    setKirimUlang(Boolean(req.no_pesanan));
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const h: HasilCheckout = await res.json();
      setHasil(h);
      if (h.hasil === "tersimpan") {
        const noPesanan = (h.diterima as BalasanN8n | null)?.no_pesanan;
        setTerakhir({ ...req, no_pesanan: noPesanan });
        if (!req.no_pesanan) kosongkan(); // kosongkan keranjang hanya untuk order baru
      }
    } catch {
      setHasil({
        hasil: "tidak_terhubung", http_status: null, pesan: "Server website tidak merespons.",
        dikirim: null, diterima: null, webhook_url: null, durasi_ms: null,
      });
    } finally {
      setMengirim(false);
      requestAnimationFrame(() => document.getElementById("hasil")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  const itemsKeranjang = isi.map((i) => ({ sku: i.sku, qty: i.qty }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    kirim({ nama_pembeli: nama, no_hp: hp, items: itemsKeranjang });
  };

  // Demo: kirim data rusak supaya terlihat n8n menolak dengan alasan jelas.
  const kirimRusak = () =>
    kirim({
      nama_pembeli: "",
      no_hp: "12",
      items: itemsKeranjang.length ? itemsKeranjang : [{ sku: "GLW-SRM-001", qty: 1 }],
    });

  const b = (hasil?.diterima ?? null) as BalasanN8n | null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/" className="text-sm text-tinta-lembut hover:text-anggur">← Kembali belanja</Link>
      <h1 className="mt-3 font-judul text-4xl font-semibold text-anggur">Checkout</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <form onSubmit={submit} className="rounded-3xl bg-white p-6 shadow-kartu sm:p-8">
          <h2 className="font-judul text-xl font-semibold">Data pembeli</h2>
          <p className="mt-1 text-sm text-tinta-lembut">
            Konfirmasi ongkir & pembayaran akan dikirim lewat WhatsApp (simulasi, tidak ada pesan sungguhan).
          </p>

          <label className="mt-6 block text-sm font-medium" htmlFor="nama">Nama lengkap</label>
          <input id="nama" className="input mt-1.5" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Dewi Lestari" required />

          <label className="mt-4 block text-sm font-medium" htmlFor="hp">Nomor WhatsApp</label>
          <input
            id="hp" className="input mt-1.5" inputMode="tel" value={hp} onChange={(e) => setHp(e.target.value)}
            placeholder="mis. 0812-555-1234" required
          />
          <p className="mt-1.5 text-xs text-tinta-lembut">Boleh ditulis 08…, +62…, pakai spasi atau strip. n8n yang merapikan.</p>

          <button type="submit" className="tombol-utama mt-6 w-full" disabled={mengirim || isi.length === 0}>
            {mengirim ? "Mengirim ke n8n…" : isi.length === 0 ? "Keranjang kosong" : `Pesan sekarang · ${rupiah(total)}`}
          </button>

          <div className="mt-8 rounded-2xl border border-dashed border-blush-tua p-4">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-mawar">Alat demo</p>
            <p className="mt-1 text-xs text-tinta-lembut">Untuk memamerkan cara kerja workflow ke calon klien.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="tombol-garis !px-4 !py-2 !text-xs" onClick={() => { setNama("kak dewi   lestari"); setHp("+62 812-555-1234"); }}>
                Isi data berantakan
              </button>
              <button type="button" className="tombol-garis !px-4 !py-2 !text-xs" onClick={kirimRusak} disabled={mengirim}>
                Kirim order rusak (uji 400)
              </button>
              <button
                type="button" className="tombol-garis !px-4 !py-2 !text-xs" disabled={!terakhir || mengirim}
                onClick={() => terakhir && kirim(terakhir)}
                title={terakhir ? `Kirim ulang ${terakhir.no_pesanan}` : "Buat order dulu"}
              >
                Kirim ulang order terakhir (uji anti dobel)
              </button>
            </div>
          </div>
        </form>

        <aside className="h-fit rounded-3xl bg-blush-muda p-6 ring-1 ring-blush-tua/60">
          <h2 className="font-judul text-xl font-semibold">Ringkasan</h2>
          {isi.length === 0 ? (
            <p className="mt-4 text-sm text-tinta-lembut">
              Keranjang kosong. <Link href="/#katalog" className="text-anggur underline">Pilih produk</Link>
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {isi.map((i) => (
                <li key={i.sku} className="flex gap-3">
                  <VisualProduk kategori={i.produk.kategori} sku={i.sku} className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{namaPendek(i.produk.nama)}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <PengaturQty qty={i.qty} onUbah={(q) => ubahQty(i.sku, q)} nama={i.produk.nama} />
                      <span className="text-sm tabular-nums">{rupiah(i.qty * i.produk.harga)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex items-baseline justify-between border-t border-blush-tua/60 pt-4">
            <span className="text-sm text-tinta-lembut">Total</span>
            <span className="font-judul text-2xl font-semibold tabular-nums">{rupiah(total)}</span>
          </div>
        </aside>
      </div>

      {hasil && (
        <div id="hasil" className="mt-10 scroll-mt-24 space-y-6">
          <div className={`rounded-3xl border p-6 ${JUDUL[hasil.hasil].warna}`} role="status">
            <h2 className="font-judul text-2xl font-semibold">{JUDUL[hasil.hasil].judul}</h2>
            <p className="mt-1 text-sm">{hasil.pesan}</p>

            {hasil.hasil === "tersimpan" && b && (
              <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="opacity-70">No pesanan</dt><dd className="font-kode font-semibold">{b.no_pesanan}</dd></div>
                <div><dt className="opacity-70">Nama (dirapikan n8n)</dt><dd className="font-semibold">{b.nama_pembeli}</dd></div>
                <div><dt className="opacity-70">No HP (dirapikan n8n)</dt><dd className="font-kode font-semibold">{b.no_hp_normal}</dd></div>
                <div><dt className="opacity-70">Total</dt><dd className="font-semibold">{typeof b.total === "number" ? rupiah(b.total) : "-"}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="opacity-70">Baris di sheet</dt>
                  <dd>{b.items?.length ?? 0} baris (1 per produk){kirimUlang && " · ini kiriman ULANG: baris yang sama diperbarui, tidak ada baris baru"}</dd>
                </div>
              </dl>
            )}
            {hasil.hasil === "tersimpan" && SHEET_URL && (
              <a href={SHEET_URL} target="_blank" rel="noreferrer" className="tombol-utama mt-5">Buka Google Sheets ↗</a>
            )}

            {hasil.hasil === "ditolak" && b?.errors && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {b.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            {hasil.hasil === "gagal_simpan" && b?.detail_error && (
              <p className="mt-3 rounded-xl bg-white/60 p-3 font-kode text-xs">Detail dari Google: {b.detail_error}</p>
            )}
          </div>
          <BalikLayar
            langkah={langkahCheckout(hasil)}
            http_status={hasil.http_status}
            durasi_ms={hasil.durasi_ms}
            dikirim={hasil.dikirim}
            diterima={hasil.diterima}
            webhook_url={hasil.webhook_url}
          />
        </div>
      )}
    </div>
  );
}
