"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Stok = { sku: string; nama: string; status: string; tersedia: number; minimum: number };

const LENCANA: Record<string, string> = {
  AMAN: "bg-[#0ca30c]/10 text-[#0b6b0b] ring-[#0ca30c]/40",
  RESTOCK: "bg-[#fab219]/15 text-[#7a5200] ring-[#fab219]/60",
  HABIS: "bg-[#d03b3b]/10 text-[#a32525] ring-[#d03b3b]/50",
};
const IKON: Record<string, string> = { AMAN: "✓", RESTOCK: "!", HABIS: "✕" };

export default function UjiStok() {
  const [stok, setStok] = useState<Stok[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);

  const muat = () =>
    fetch("/api/uji-stok", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setStok(j.stok) : setPesan({ ok: false, teks: j.pesan })))
      .catch(() => setPesan({ ok: false, teks: "Server tidak merespons." }));
  useEffect(() => {
    muat();
  }, []);

  async function aksi(body: Record<string, string>, label: string) {
    setSibuk(label);
    setPesan(null);
    try {
      const r = await fetch("/api/uji-stok", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setPesan({ ok: Boolean(j.ok), teks: j.pesan ?? "Selesai" });
      await muat();
    } catch {
      setPesan({ ok: false, teks: "Server tidak merespons." });
    } finally {
      setSibuk(null);
    }
  }

  const bermasalah = stok?.filter((s) => s.status !== "AMAN").length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-mawar">Mode uji</p>
      <h1 className="mt-1 font-judul text-4xl font-semibold text-anggur">Uji Stok & Bot Telegram</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tinta-lembut">
        Habiskan atau tipiskan stok produk dengan satu klik, lalu lihat bot <b>@AMBAPRIMEBOT</b> mengirim peringatan ke Telegram. Tombol ini
        membuat <b>order uji</b> (no pesanan berawalan <code className="font-kode">UJI-</code>) yang lewat gerbang order yang sama dengan checkout.
        Setelah selesai, klik <b>Reset</b> untuk menghapus semua order uji sehingga stok kembali seperti semula.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => aksi({ aksi: "reset" }, "reset")} disabled={!!sibuk} className="tombol-utama">
          {sibuk === "reset" ? "Mereset…" : "↺ Reset semua order uji"}
        </button>
        <button onClick={() => muat()} disabled={!!sibuk} className="tombol-garis">↻ Perbarui</button>
        <Link href="/dashboard" className="tombol-garis">Buka Dashboard</Link>
      </div>

      {pesan && (
        <p
          role="status"
          className={`mt-5 rounded-2xl border p-4 text-sm ${pesan.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-mawar/40 bg-blush-muda text-anggur-tua"}`}
        >
          {pesan.ok ? "✓ " : "✕ "}
          {pesan.teks}
        </p>
      )}

      <section className="mt-8 rounded-3xl bg-white p-4 shadow-kartu sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-judul text-lg font-semibold">Stok sekarang</h2>
          {stok && <p className="text-xs text-tinta-lembut">{bermasalah} dari {stok.length} produk perlu perhatian</p>}
        </div>

        {!stok ? (
          <p className="mt-6 text-sm text-tinta-lembut">Memuat stok dari Google Sheets…</p>
        ) : (
          <ul className="mt-4 divide-y divide-blush-tua/40">
            {stok.map((s) => (
              <li key={s.sku} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.nama}</p>
                  <p className="font-kode text-xs text-tinta-lembut">
                    {s.sku} · sisa <b className="tabular-nums text-tinta">{s.tersedia}</b> · minimum {s.minimum}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${LENCANA[s.status] ?? LENCANA.AMAN}`}>
                  {IKON[s.status] ?? "?"} {s.status}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => aksi({ aksi: "menipis", sku: s.sku }, `m:${s.sku}`)}
                    disabled={!!sibuk || s.tersedia < s.minimum}
                    className="tombol-garis !px-3 !py-1.5 !text-xs"
                  >
                    {sibuk === `m:${s.sku}` ? "…" : "⚠️ Bikin menipis"}
                  </button>
                  <button
                    onClick={() => aksi({ aksi: "habiskan", sku: s.sku }, `h:${s.sku}`)}
                    disabled={!!sibuk || s.tersedia <= 0}
                    className="tombol-garis !px-3 !py-1.5 !text-xs"
                  >
                    {sibuk === `h:${s.sku}` ? "…" : "⛔ Habiskan"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-tinta-lembut">
        Tips: setelah menghabiskan stok, kirim <code className="font-kode">/restock</code> atau <code className="font-kode">/stok</code> ke bot. Order uji juga
        muncul di <code className="font-kode">/hariini</code> dan di tab <code className="font-kode">Order_Masuk</code>.
      </p>
    </div>
  );
}
