"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DAFTAR_KURIR, LABEL_STATUS, LANGKAH } from "@/lib/lacak";
import { rupiah } from "@/lib/format";
import type { OrderRingkas } from "@/lib/dasbor";

/** Teks tombol untuk tiap langkah. */
const TOMBOL: Record<string, string> = {
  diproses: "📦 Kemas",
  dikirim: "🚚 Kirim",
  sampai: "🏠 Sudah sampai",
  selesai: "✅ Selesai",
  batal: "Batalkan",
  retur: "Retur",
};

export default function KelolaOrder({ orders }: { orders: OrderRingkas[] }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [kurir, setKurir] = useState<Record<string, string>>({});
  const [resi, setResi] = useState<Record<string, string>>({});

  async function ubah(no: string, status: string) {
    setSibuk(`${no}:${status}`);
    setPesan(null);
    try {
      const body: Record<string, string> = { no_pesanan: no, status };
      if (status === "dikirim") {
        body.kurir = kurir[no] ?? DAFTAR_KURIR[0];
        if (resi[no]?.trim()) body.no_resi = resi[no].trim();
      }
      const r = await fetch("/api/order-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setPesan({ ok: Boolean(j.ok), teks: j.pesan ?? "Selesai" });
      if (j.ok) router.refresh();
    } catch {
      setPesan({ ok: false, teks: "Server tidak merespons." });
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div>
      {pesan && (
        <p
          role="status"
          className={`mb-4 rounded-2xl border p-3 text-sm ${pesan.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-mawar/40 bg-blush-muda text-anggur-tua"}`}
        >
          {pesan.ok ? "✓ " : "✕ "}
          {pesan.teks}
        </p>
      )}
      {orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-tinta-lembut">
          Tidak ada order website yang sedang berjalan. Coba belanja di toko demo, lalu kembali ke sini.
        </p>
      ) : (
        <ul className="divide-y divide-blush-tua/40">
          {orders.map((o) => (
            <li key={o.no_pesanan} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <p className="break-all font-kode text-xs font-semibold">{o.no_pesanan}</p>
                <p className="mt-0.5 text-sm">
                  {o.nama} · <span className="tabular-nums">{rupiah(o.total)}</span>
                </p>
                <p className="mt-0.5 text-xs text-tinta-lembut">
                  {o.tanggal} · <b className="text-tinta">{LABEL_STATUS[o.status_pesanan] ?? o.status_pesanan}</b>
                  {o.no_resi && ` · ${o.kurir} ${o.no_resi}`}
                </p>
              </div>
              {o.status_pesanan === "diproses" && (
                <div className="flex flex-wrap gap-2">
                  <select
                    value={kurir[o.no_pesanan] ?? DAFTAR_KURIR[0]}
                    onChange={(e) => setKurir({ ...kurir, [o.no_pesanan]: e.target.value })}
                    className="input !w-auto !rounded-full !py-1.5 !text-xs"
                    aria-label={`Kurir untuk ${o.no_pesanan}`}
                  >
                    {DAFTAR_KURIR.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                  <input
                    value={resi[o.no_pesanan] ?? ""}
                    onChange={(e) => setResi({ ...resi, [o.no_pesanan]: e.target.value })}
                    placeholder="No resi (kosong = otomatis)"
                    className="input !w-48 !rounded-full !py-1.5 !text-xs"
                    aria-label={`No resi untuk ${o.no_pesanan}`}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(LANGKAH[o.status_pesanan] ?? []).map((st) => (
                  <button
                    key={st}
                    onClick={() => ubah(o.no_pesanan, st)}
                    disabled={sibuk !== null}
                    className={`${st === "batal" || st === "retur" ? "tombol-garis" : "tombol-utama"} !px-3 !py-1.5 !text-xs`}
                  >
                    {sibuk === `${o.no_pesanan}:${st}` ? "…" : TOMBOL[st] ?? st}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
