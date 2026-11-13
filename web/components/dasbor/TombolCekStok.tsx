"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Minta n8n (workflow 06) mengirim ringkasan stok ke Telegram sekarang, lalu muat ulang data. */
export default function TombolCekStok({ aktif }: { aktif: boolean }) {
  const router = useRouter();
  const [pesan, setPesan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [, mulai] = useTransition();

  async function cek() {
    setSibuk(true);
    setPesan("");
    try {
      const r = await fetch("/api/cek-stok", { method: "POST" });
      const j = await r.json();
      setPesan(j.pesan ?? "Selesai");
    } catch {
      setPesan("Tidak bisa menghubungi server.");
    } finally {
      setSibuk(false);
      mulai(() => router.refresh());
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={() => mulai(() => router.refresh())} className="tombol-garis !px-4 !py-2 !text-xs">↻ Perbarui data</button>
      <button onClick={cek} disabled={!aktif || sibuk} className="tombol-utama !px-4 !py-2 !text-xs" title={aktif ? "" : "n8n belum tersambung"}>
        {sibuk ? "Mengecek…" : "📨 Kirim ringkasan stok ke Telegram"}
      </button>
      {pesan && <span className="text-xs text-tinta-lembut" role="status">{pesan}</span>}
    </div>
  );
}
