"use client";

import { useState } from "react";
import type { HasilCheckout } from "@/lib/tipe";

export type StatusLangkah = "ok" | "gagal" | "lewat" | "peringatan";
export type Langkah = { id: string; judul: string; isi: string; status: StatusLangkah };

const GAYA: Record<StatusLangkah, { lingkar: string; ikon: string; teks: string }> = {
  ok: { lingkar: "bg-emerald-500 text-white", ikon: "✓", teks: "text-white" },
  gagal: { lingkar: "bg-mawar text-white", ikon: "✕", teks: "text-white" },
  peringatan: { lingkar: "bg-amber-400 text-tinta", ikon: "!", teks: "text-white" },
  lewat: { lingkar: "bg-white/10 text-white/40", ikon: "–", teks: "text-white/40" },
};

/** Langkah untuk checkout toko (website → workflow 03). */
export function langkahCheckout(h: HasilCheckout): Langkah[] {
  const dasar = [
    { id: "web", judul: "Website", isi: "Harga dihitung ulang di server, no pesanan dibuat" },
    { id: "webhook", judul: "Webhook n8n", isi: "Workflow 03 menerima POST" },
    { id: "validasi", judul: "Validasi", isi: "Field wajib, SKU, qty, no HP" },
    { id: "normal", judul: "Normalisasi", isi: "No HP → 628…, nama rapi, 1 produk = 1 baris" },
    { id: "sheets", judul: "Google Sheets", isi: "Upsert ke tab Order_Masuk (kunci no_pesanan|sku)" },
    { id: "balas", judul: "Balasan", isi: "HTTP status + JSON kembali ke website" },
  ];
  const semua = (s: StatusLangkah): Record<string, StatusLangkah> => Object.fromEntries(dasar.map((l) => [l.id, s]));
  let st: Record<string, StatusLangkah>;
  switch (h.hasil) {
    case "tersimpan":
      st = semua("ok");
      if ((h.diterima as { status?: string } | null)?.status === "perlu_cek") st.normal = "peringatan";
      break;
    case "ditolak":
      st = { ...semua("lewat"), web: "ok", webhook: "ok", validasi: "gagal", balas: "ok" };
      break;
    case "gagal_simpan":
      st = { ...semua("ok"), sheets: "gagal" };
      break;
    case "tidak_terhubung":
      st = { ...semua("lewat"), web: "ok", webhook: "gagal" };
      break;
    default:
      st = { ...semua("lewat"), web: "gagal" };
  }
  return dasar.map((l) => ({ ...l, status: st[l.id] }));
}

type Props = {
  langkah: Langkah[];
  http_status: number | null;
  durasi_ms: number | null;
  dikirim: unknown;
  diterima: unknown;
  webhook_url: string | null;
  labelKirim?: string;
  labelTerima?: string;
};

export default function BalikLayar({
  langkah, http_status, durasi_ms, dikirim, diterima, webhook_url,
  labelKirim = "JSON dikirim ke n8n", labelTerima = "JSON balasan n8n",
}: Props) {
  const [tab, setTab] = useState<"kirim" | "terima">("terima");
  const json = tab === "kirim" ? dikirim : diterima;
  const kolom = langkah.length === 7 ? "lg:grid-cols-7" : "lg:grid-cols-6";

  return (
    <section className="overflow-hidden rounded-3xl bg-anggur-tua text-blush-muda shadow-kartu">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-6">
        <h3 className="font-judul text-xl font-semibold text-white">Di balik layar</h3>
        <p className="font-kode text-xs text-blush-tua">
          {http_status !== null ? `HTTP ${http_status}` : "tanpa balasan"}
          {durasi_ms !== null && ` · ${durasi_ms} ms`}
        </p>
      </div>

      <ol className={`mt-5 grid gap-px bg-white/5 sm:grid-cols-3 ${kolom}`}>
        {langkah.map((l, i) => {
          const g = GAYA[l.status];
          return (
            <li key={l.id} className="bg-anggur-tua px-4 py-4">
              <div className="flex items-center gap-2">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${g.lingkar}`}>{g.ikon}</span>
                <span className={`text-sm font-semibold ${g.teks}`}>
                  {i + 1}. {l.judul}
                </span>
              </div>
              <p className={`mt-1.5 text-xs leading-relaxed ${l.status === "lewat" ? "text-white/30" : "text-blush-tua/80"}`}>{l.isi}</p>
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
              {t === "kirim" ? labelKirim : labelTerima}
            </button>
          ))}
        </div>
        <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 font-kode text-[12px] leading-relaxed text-blush-muda">
          {json ? JSON.stringify(json, null, 2) : "(kosong)"}
        </pre>
        {webhook_url && <p className="mt-2 break-all font-kode text-[11px] text-blush-tua/70">POST {webhook_url}</p>}
      </div>
    </section>
  );
}
