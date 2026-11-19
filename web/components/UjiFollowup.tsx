"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = {
  id: string; jenis: "ulasan" | "beli_ulang"; no: string; nama: string; hp: string; jatuhTempo: string; terlambat: number;
  produk: string; pesan: string; linkWa: string; linkWaWeb: string;
};

const LABEL: Record<Item["jenis"], string> = { ulasan: "⭐ Minta ulasan", beli_ulang: "🔁 Beli ulang" };
const KUNCI_HP = "glowra-uji-fu-hp";

export default function UjiFollowup() {
  const [daftar, setDaftar] = useState<Item[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [nama, setNama] = useState("Dewi Lestari");
  const [hp, setHp] = useState("");

  const muat = () =>
    fetch("/api/uji-followup", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setDaftar(j.daftar) : setPesan({ ok: false, teks: j.pesan })))
      .catch(() => setPesan({ ok: false, teks: "Server tidak merespons." }));
  useEffect(() => {
    muat();
    try {
      setHp(localStorage.getItem(KUNCI_HP) ?? "");
    } catch {
      /* abaikan */
    }
  }, []);

  async function aksi(body: Record<string, string>, label: string) {
    setSibuk(label);
    setPesan(null);
    try {
      if (body.hp) localStorage.setItem(KUNCI_HP, body.hp);
    } catch {
      /* abaikan */
    }
    try {
      const r = await fetch("/api/uji-followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setPesan({ ok: Boolean(j.ok), teks: j.pesan ?? "Selesai" });
      await muat();
    } catch {
      setPesan({ ok: false, teks: "Server tidak merespons." });
    } finally {
      setSibuk(null);
    }
  }

  const bisaBuat = hp.replace(/\D/g, "").length >= 9;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-mawar">Mode uji</p>
      <h1 className="mt-1 font-judul text-4xl font-semibold text-anggur">Uji Follow-up Pelanggan</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tinta-lembut">
        Aslinya, pelanggan masuk daftar follow-up <b>3 hari setelah paket sampai</b> (minta ulasan) dan <b>saat produknya hampir habis</b> (pengingat beli ulang),
        dan hanya kalau mereka mencentang izin WhatsApp saat checkout. Supaya tidak perlu menunggu, tombol di bawah membuat <b>order uji</b> (berawalan{" "}
        <code className="font-kode">UJI-FU-</code>) yang seolah-olah sudah sampai beberapa hari lalu.
      </p>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-kartu sm:p-6">
        <h2 className="font-judul text-lg font-semibold">1. Buat pelanggan contoh</h2>
        <p className="mt-1 text-xs text-tinta-lembut">Pakai nomor WhatsApp kamu sendiri supaya bisa melihat pesannya terisi di WhatsApp.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Nama pelanggan
            <input className="input mt-1.5" value={nama} onChange={(e) => setNama(e.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Nomor WhatsApp
            <input className="input mt-1.5" inputMode="tel" value={hp} onChange={(e) => setHp(e.target.value)} placeholder="mis. 0812-3456-7890" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="tombol-utama !text-sm" disabled={!!sibuk || !bisaBuat} onClick={() => aksi({ aksi: "contoh", skenario: "ulasan", nama, hp }, "u")}>
            {sibuk === "u" ? "Membuat…" : "⭐ Paket sampai 3 hari lalu"}
          </button>
          <button className="tombol-utama !text-sm" disabled={!!sibuk || !bisaBuat} onClick={() => aksi({ aksi: "contoh", skenario: "beli_ulang", nama, hp }, "b")}>
            {sibuk === "b" ? "Membuat…" : "🔁 Serum dibeli ±4 minggu lalu"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-kartu sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-judul text-lg font-semibold">2. Daftar follow-up hari ini</h2>
            <p className="mt-1 text-xs text-tinta-lembut">Ini yang dikirim bot ke Telegram setiap pagi 08:00 WIB.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="tombol-utama !text-sm" disabled={!!sibuk} onClick={() => aksi({ aksi: "kirim" }, "k")}>
              {sibuk === "k" ? "Mengirim…" : "📱 Kirim ke Telegram sekarang"}
            </button>
            <button className="tombol-garis !text-sm" disabled={!!sibuk} onClick={() => muat()}>↻ Perbarui</button>
          </div>
        </div>

        {pesan && (
          <p role="status" className={`mt-4 rounded-2xl border p-4 text-sm ${pesan.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-mawar/40 bg-blush-muda text-anggur-tua"}`}>
            {pesan.ok ? "✓ " : "✕ "}
            {pesan.teks}
          </p>
        )}

        {!daftar ? (
          <p className="mt-6 text-sm text-tinta-lembut">Memuat dari Google Sheets…</p>
        ) : !daftar.length ? (
          <p className="mt-6 text-sm text-tinta-lembut">Belum ada pelanggan yang perlu dihubungi hari ini. Buat contoh di langkah 1.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {daftar.map((x) => (
              <li key={x.id} className="rounded-2xl border border-blush-tua/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {LABEL[x.jenis]} · {x.nama}
                    {x.terlambat > 0 && <span className="ml-2 text-xs font-normal text-tinta-lembut">terlambat {x.terlambat} hari</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a href={x.linkWa} target="_blank" rel="noreferrer" className="tombol-garis !px-3 !py-1.5 !text-xs">📱 WhatsApp (HP) ↗</a>
                    <a href={x.linkWaWeb} target="_blank" rel="noreferrer" className="tombol-garis !px-3 !py-1.5 !text-xs">💻 WhatsApp Web ↗</a>
                  </div>
                </div>
                <p className="mt-1 font-kode text-xs text-tinta-lembut">{x.no} · {x.produk}</p>
                <p className="mt-3 whitespace-pre-line rounded-xl bg-blush-muda/60 p-3 text-sm">{x.pesan}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-kartu sm:p-6">
        <h2 className="font-judul text-lg font-semibold">3. Selesai mencoba</h2>
        <p className="mt-1 text-xs text-tinta-lembut">
          Menghapus order uji, catatan di tab <code className="font-kode">Follow_Up</code>, pesanan yang dibuat dari link pesan ulang order uji, dan nomor uji di{" "}
          <code className="font-kode">Tidak_Dihubungi</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="tombol-garis !text-sm" disabled={!!sibuk} onClick={() => aksi({ aksi: "reset" }, "r")}>
            {sibuk === "r" ? "Mereset…" : "↺ Reset semua data uji follow-up"}
          </button>
          <Link href="/dashboard" className="tombol-garis !text-sm">Buka Dashboard</Link>
        </div>
      </section>
    </div>
  );
}
