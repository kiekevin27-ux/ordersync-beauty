"use client";

import { useState } from "react";
import type { HasilCheckout } from "@/lib/tipe";

type Status = "ok" | "gagal" | "lewat" | "peringatan";

const LANGKAH = [
  { id: "web", judul: "Website", isi: "Harga dihitung ulang di server, no pesanan dibuat" },
  { id: "webhook", judul: "Webhook n8n", isi: "Workflow 03 menerima POST" },
  { id: "validasi", judul: "Validasi", isi: "Field wajib, SKU, qty, no HP" },
  { id: "normal", judul: "Normalisasi", isi: "No HP → 628…, nama rapi, 1 produk = 1 baris" },
  { id: "sheets", judul: "Google Sheets", isi: "Upsert ke tab Order_Masuk (kunci no_pesanan|sku)" },
  { id: "balas", judul: "Balasan", isi: "HTTP status + JSON kembali ke website" },
] as const;

function statusLangkah(h: HasilCheckout): Record<string, Status> {
  const semua = (s: Status) => Object.fromEntries(LANGKAH.map((l) => [l.id, s])) as Record<string, Status>;
  switch (h.hasil) {
    case "tersimpan": {
      const r = semua("ok");
      if ((h.diterima as { status?: string } | null)?.status === "perlu_cek") r.normal = "peringatan";
      return r;
    }
    case "ditolak":
      return { ...semua("lewat"), web: "ok", webhook: "ok", validasi: "gagal", balas: "ok" };
    case "gagal_simpan":
      return { ...semua("ok"), sheets: "gagal" };
    case "tidak_terhubung":
      return { ...semua("lewat"), web: "ok", webhook: "gagal" };
    default:
      return { ...semua("lewat"), web: "gagal" };
  }
}

const GAYA: Record<Status, { lingkar: string; ikon: string; teks: string }> = {
  ok: { lingkar: "bg-emerald-500 text-white", ikon: "✓", teks: "text-white" },
  gagal: { lingkar: "bg-mawar text-white", ikon: "✕", teks: "text-white" },
  peringatan: { lingkar: "bg-amber-400 text-tinta", ikon: "!", teks: "text-white" },
  lewat: { lingkar: "bg-white/10 text-white/40", ikon: "–", teks: "text-white/40" },
};

export default function BalikLayar({ hasil }: { hasil: HasilCheckout }) {
  const st = statusLangkah(hasil);
  const [tab, setTab] = useState<"kirim" | "terima">("terima");
  const json = tab === "kirim" ? hasil.dikirim : hasil.diterima;

  return (
    <section className="overflow-hidden rounded-3xl bg-anggur-tua text-blush-muda shadow-kartu">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-6">
        <h3 className="font-judul text-xl font-semibold text-white">Di balik layar</h3>
        <p className="font-kode text-xs text-blush-tua">
          {hasil.http_status !== null ? `HTTP ${hasil.http_status}` : "tanpa balasan"}
          {hasil.durasi_ms !== null && ` · ${hasil.durasi_ms} ms`}
        </p>
      </div>

      <ol className="mt-5 grid gap-px bg-white/5 sm:grid-cols-3 lg:grid-cols-6">
        {LANGKAH.map((l, i) => {
          const g = GAYA[st[l.id]];
          return (
            <li key={l.id} className="bg-anggur-tua px-4 py-4">
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${g.lingkar}`}>{g.ikon}</span>
                <span className={`text-sm font-semibold ${g.teks}`}>
                  {i + 1}. {l.judul}
                </span>
              </div>
              <p className={`mt-1.5 text-xs leading-relaxed ${st[l.id] === "lewat" ? "text-white/30" : "text-blush-tua/80"}`}>{l.isi}</p>
            </li>
          );
        })}
      </ol>

      <div className="px-6 pb-6 pt-5">
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-sm">
          {(["kirim", "terima"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 transition ${tab === t ? "bg-white text-anggur-tua" : "text-blush-tua hover:text-white"}`}
            >
              {t === "kirim" ? "JSON dikirim ke n8n" : "JSON balasan n8n"}
            </button>
          ))}
        </div>
        <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-black/30 p-4 font-kode text-[12px] leading-relaxed text-blush-muda">
          {json ? JSON.stringify(json, null, 2) : "(kosong)"}
        </pre>
        {hasil.webhook_url && <p className="mt-2 break-all font-kode text-[11px] text-blush-tua/70">POST {hasil.webhook_url}</p>}
      </div>
    </section>
  );
}
