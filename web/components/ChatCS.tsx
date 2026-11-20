"use client";

import { useEffect, useRef, useState } from "react";
import { useKeranjang } from "./KeranjangProvider";
import VisualProduk from "./VisualProduk";
import { rupiah } from "@/lib/format";
import type { BalasanCS, KartuProduk, Mode } from "@/lib/cs";

type Pesan = { dari: "saya" | "cs"; teks: string; produk?: KartuProduk[]; pilihan?: string[] };

const SAPAAN: Pesan = {
  dari: "cs",
  teks: "Halo Kak, selamat datang di Glowra Beauty 🌸\nSaya asisten otomatis yang siap 24 jam. Mau tanya apa?",
  pilihan: ["Rekomendasi untuk kulitku", "Ongkir & pengiriman", "Cara bayar", "Cek pesanan", "Chat admin"],
};

const LABEL_STOK: Record<KartuProduk["stok"], { teks: string; kelas: string }> = {
  ada: { teks: "Stok tersedia", kelas: "text-emerald-700" },
  sedikit: { teks: "Sisa sedikit", kelas: "text-amber-700" },
  habis: { teks: "Stok habis", kelas: "text-mawar" },
  "?": { teks: "Cek stok di keranjang", kelas: "text-tinta-lembut" },
};

export default function ChatCS() {
  const { tambah, bukaLaci } = useKeranjang();
  const [buka, setBuka] = useState(false);
  const [pesan, setPesan] = useState<Pesan[]>([SAPAAN]);
  const [ketik, setKetik] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [mode, setMode] = useState<Mode>("");
  const [noPesanan, setNoPesanan] = useState<string | undefined>();
  const bawah = useRef<HTMLDivElement>(null);
  const kolom = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bawah.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pesan, sibuk]);

  useEffect(() => {
    if (buka) kolom.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [buka]);

  async function kirim(teks: string) {
    const isi = teks.trim();
    if (!isi || sibuk) return;
    setPesan((p) => [...p, { dari: "saya", teks: isi }]);
    setKetik("");
    setSibuk(true);
    try {
      const res = await fetch("/api/cs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pesan: isi, mode, noPesanan }),
      });
      const j: BalasanCS = await res.json();
      setPesan((p) => [...p, { dari: "cs", teks: j.teks, produk: j.produk, pilihan: j.pilihan }]);
      setMode(j.mode ?? "");
      setNoPesanan(j.noPesanan);
    } catch {
      setPesan((p) => [...p, { dari: "cs", teks: "Maaf Kak, koneksi terputus. Coba kirim lagi ya 🙏" }]);
    } finally {
      setSibuk(false);
    }
  }

  const terakhir = pesan.length - 1;

  return (
    <>
      {/* Tombol bulat di pojok kanan bawah */}
      <button
        onClick={() => setBuka((b) => !b)}
        className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-anggur px-4 py-3 text-sm font-semibold text-white shadow-kartu transition hover:bg-anggur-tua focus:outline-none focus-visible:ring-4 focus-visible:ring-mawar/30 sm:bottom-6 sm:right-6 ${buka ? "max-sm:hidden" : ""}`}
        aria-expanded={buka}
        aria-label={buka ? "Tutup chat CS" : "Buka chat CS"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 5h16v11H9l-5 4V5Z" strokeLinejoin="round" />
          <path d="M8 10h8M8 13h5" strokeLinecap="round" />
        </svg>
        {buka ? "Tutup" : "Tanya CS"}
      </button>

      {buka && (
        <section
          role="dialog"
          aria-label="Chat customer service Glowra"
          className="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-blush-tua/60 bg-krem shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-3xl"
        >
          <header className="flex items-center justify-between bg-anggur px-5 py-4 text-white">
            <div>
              <p className="font-judul text-lg font-semibold leading-tight">Glowra CS</p>
              <p className="text-xs text-blush">● Asisten otomatis · balas instan</p>
            </div>
            <button onClick={() => setBuka(false)} className="rounded-full px-3 py-1 text-2xl leading-none hover:bg-white/10" aria-label="Tutup chat">
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {pesan.map((m, i) => (
              <div key={i} className={m.dari === "saya" ? "flex justify-end" : ""}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.dari === "saya" ? "rounded-br-md bg-anggur text-white" : "rounded-bl-md bg-white text-tinta shadow-kartu"
                  }`}
                >
                  {m.teks}
                </div>

                {m.produk?.length ? (
                  <div className="mt-2 space-y-2">
                    {m.produk.map((p) => (
                      <div key={p.sku} className="flex items-center gap-3 rounded-2xl border border-blush-tua/50 bg-white p-2.5">
                        <VisualProduk kategori={p.kategori} sku={p.sku} className="h-14 w-14 shrink-0 rounded-xl" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold leading-snug">{p.nama}</p>
                          <p className="text-[13px] tabular-nums text-anggur">{rupiah(p.harga)}</p>
                          <p className={`text-[11px] ${LABEL_STOK[p.stok].kelas}`}>
                            {LABEL_STOK[p.stok].teks}
                            {p.sisa ? ` (${p.sisa} pcs)` : ""}
                          </p>
                        </div>
                        <button
                          disabled={p.stok === "habis"}
                          onClick={() => {
                            tambah(p.sku);
                            setPesan((x) => [...x, { dari: "cs", teks: `${p.nama} sudah masuk keranjang 🛍️`, pilihan: ["Buka keranjang", "Cara bayar"] }]);
                          }}
                          className="shrink-0 rounded-full bg-anggur px-3 py-1.5 text-xs font-semibold text-white hover:bg-anggur-tua disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          + Keranjang
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Tombol pilihan hanya untuk balasan terakhir supaya tidak membingungkan */}
                {i === terakhir && m.pilihan?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.pilihan.map((p) => (
                      <button
                        key={p}
                        onClick={() => (p === "Buka keranjang" ? (setBuka(false), bukaLaci(true)) : kirim(p))}
                        className="rounded-full border border-anggur/30 bg-white px-3 py-1.5 text-xs font-medium text-anggur hover:border-anggur hover:bg-blush-muda"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {sibuk && (
              <div className="w-16 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-kartu" aria-label="CS sedang mengetik">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-tinta-lembut" style={{ animationDelay: `${d * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
            <div ref={bawah} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              kirim(ketik);
            }}
            className="flex gap-2 border-t border-blush-tua/60 bg-white p-3"
          >
            <input
              ref={kolom}
              value={ketik}
              onChange={(e) => setKetik(e.target.value)}
              maxLength={500}
              placeholder={mode === "tunggu_hp" ? "4 digit terakhir nomor HP…" : mode === "tunggu_admin" ? "Tulis pesan untuk admin…" : "Tulis pertanyaan…"}
              inputMode={mode === "tunggu_hp" ? "numeric" : "text"}
              className="min-w-0 flex-1 rounded-full border border-blush-tua bg-krem px-4 py-2.5 text-sm outline-none focus:border-anggur"
              aria-label="Pesan"
            />
            <button type="submit" disabled={sibuk || !ketik.trim()} className="rounded-full bg-anggur px-4 text-sm font-semibold text-white hover:bg-anggur-tua disabled:opacity-40">
              Kirim
            </button>
          </form>
        </section>
      )}
    </>
  );
}
