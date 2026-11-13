"use client";

import { useEffect, useMemo, useState } from "react";
import { useKeranjang } from "./KeranjangProvider";
import BalikLayar, { type Langkah, type StatusLangkah } from "./BalikLayar";
import { namaPendek, rupiah } from "@/lib/format";
import InfoModeOnline from "./InfoModeOnline";

type Platform = "shopee" | "tiktok";

type OrderSimulasi = {
  platform: Platform;
  id: string;
  status: string;
  nama: string;
  no_hp: string;
  items: { sku: string; nama: string; qty: number; harga: number }[];
};

type HasilSimulasi = {
  hasil: string;
  pesan?: string;
  http_status: number | null;
  durasi_ms: number | null;
  dikirim: unknown;
  diterima: Record<string, unknown> | null;
  webhook_url: string | null;
  order?: OrderSimulasi;
};

// Harus sama dengan web/lib/simulator.ts (STATUS_PLATFORM)
const STATUS: Record<Platform, { kode: string; label: string }[]> = {
  shopee: [
    { kode: "UNPAID", label: "Belum bayar" },
    { kode: "READY_TO_SHIP", label: "Perlu dikirim" },
    { kode: "SHIPPED", label: "Sedang dikirim" },
    { kode: "COMPLETED", label: "Selesai" },
    { kode: "CANCELLED", label: "Batal" },
    { kode: "TO_RETURN", label: "Pengembalian" },
  ],
  tiktok: [
    { kode: "UNPAID", label: "Unpaid" },
    { kode: "AWAITING_SHIPMENT", label: "Awaiting shipment" },
    { kode: "IN_TRANSIT", label: "In transit" },
    { kode: "COMPLETED", label: "Completed" },
    { kode: "CANCELLED", label: "Cancelled" },
  ],
};

const NAMA = ["Nadia Putri", "Rizky Pratama", "Ayu Lestari", "Dimas Saputra", "Salsa Handayani", "Bagas Wibowo", "Intan Permata", "Farhan Akbar"];
const acakDari = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const hpAcak = () => `08${acakDari(["12", "13", "21", "57", "95"])}-555-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;

const LABEL_PLATFORM: Record<Platform, { nama: string; kelas: string }> = {
  shopee: { nama: "Shopee", kelas: "bg-[#EE4D2D] text-white" },
  tiktok: { nama: "TikTok Shop", kelas: "bg-black text-white" },
};

function langkahMarketplace(h: HasilSimulasi): Langkah[] {
  const dasar = [
    { id: "mp", judul: "Marketplace", isi: "Kirim notifikasi singkat: order X → status Y" },
    { id: "wh", judul: "Webhook n8n", isi: "Workflow 04 mengenali platform & status" },
    { id: "api", judul: "Ambil detail", isi: "n8n memanggil API detail order marketplace" },
    { id: "tr", judul: "Terjemahkan", isi: "Format Shopee/TikTok → format Glowra" },
    { id: "val", judul: "Gerbang 03", isi: "Validasi + rapikan (workflow 03)" },
    { id: "gs", judul: "Google Sheets", isi: "Upsert baris, status pesanan ikut diperbarui" },
    { id: "bl", judul: "Balasan", isi: "200 = selesai · 500 = marketplace kirim ulang nanti" },
  ];
  const s = (ok: string[], gagal: string[] = [], peringatan: string[] = []): Record<string, StatusLangkah> =>
    Object.fromEntries(dasar.map((l) => [l.id, gagal.includes(l.id) ? "gagal" : peringatan.includes(l.id) ? "peringatan" : ok.includes(l.id) ? "ok" : "lewat"]));
  const status = String(h.diterima?.status ?? h.hasil);
  let st: Record<string, StatusLangkah>;
  if (h.hasil === "tidak_terhubung" || h.http_status === null) st = s(["mp"], ["wh"]);
  else if (status === "diabaikan") st = s(["mp", "wh", "bl"]);
  else if (status === "tidak_dikenal") st = s(["mp", "bl"], [], ["wh"]);
  else if (status === "gagal_ambil_detail") st = s(["mp", "wh", "bl"], ["api"]);
  else if (status === "ditolak_gerbang") st = s(["mp", "wh", "api", "tr", "bl"], ["val"]);
  else if (status === "gagal_simpan") st = s(["mp", "wh", "api", "tr", "val", "bl"], ["gs"]);
  else st = s(dasar.map((l) => l.id));
  return dasar.map((l) => ({ ...l, status: st[l.id] }));
}

const JUDUL: Record<string, { judul: string; warna: string }> = {
  tercatat: { judul: "Notifikasi diproses, order tercatat di Google Sheets 🎉", warna: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  diabaikan: { judul: "Notifikasi diterima, tapi sengaja tidak dicatat", warna: "border-sky-300 bg-sky-50 text-sky-900" },
  ditolak_gerbang: { judul: "Order ditolak gerbang (data tidak valid)", warna: "border-amber-300 bg-amber-50 text-amber-900" },
  gagal_ambil_detail: { judul: "Gagal mengambil detail order dari API marketplace", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
  gagal_simpan: { judul: "Gagal menulis ke Google Sheets (marketplace akan mengirim ulang)", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
  tidak_terhubung: { judul: "Simulator tidak bisa menghubungi n8n", warna: "border-mawar/40 bg-blush-muda text-anggur-tua" },
};

export default function SimulatorMarketplace() {
  const { produk } = useKeranjang();
  const [platform, setPlatform] = useState<Platform>("shopee");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [nama, setNama] = useState("");
  const [hp, setHp] = useState("");
  const [samarkan, setSamarkan] = useState(false);
  const [orders, setOrders] = useState<OrderSimulasi[]>([]);
  const [pilihStatus, setPilihStatus] = useState<Record<string, string>>({});
  const [mengirim, setMengirim] = useState<string | null>(null);
  const [hasil, setHasil] = useState<HasilSimulasi | null>(null);
  const [galat, setGalat] = useState("");

  const muatOrder = () =>
    fetch("/api/simulator", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => {});
  useEffect(() => {
    muatOrder();
  }, []);

  const dipilih = useMemo(() => Object.entries(qty).filter(([, q]) => q > 0).map(([sku, q]) => ({ sku, qty: q })), [qty]);
  const total = dipilih.reduce((s, it) => s + it.qty * (produk.find((p) => p.sku === it.sku)?.harga ?? 0), 0);

  const acakIsi = () => {
    const jumlah = 1 + Math.floor(Math.random() * 3);
    const baru: Record<string, number> = {};
    [...produk].sort(() => Math.random() - 0.5).slice(0, jumlah).forEach((p) => (baru[p.sku] = 1 + Math.floor(Math.random() * 3)));
    setQty(baru);
    setNama(acakDari(NAMA));
    setHp(hpAcak());
  };

  async function kirim(payload: Record<string, unknown>, label: string) {
    setMengirim(label);
    setGalat("");
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const h: HasilSimulasi = await res.json();
      if (h.hasil === "salah_input") {
        setGalat(h.pesan ?? "Input tidak valid");
      } else {
        setHasil(h);
        requestAnimationFrame(() => document.getElementById("hasil-sim")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
      await muatOrder();
    } catch {
      setGalat("Server toko tidak merespons.");
    } finally {
      setMengirim(null);
    }
  }

  const buat = () => kirim({ aksi: "buat", platform, items: dipilih, nama, no_hp: hp, samarkan_hp: samarkan }, "buat");

  const kunciOrder = (o: OrderSimulasi) => `${o.platform}:${o.id}`;
  const hasilStatus = hasil ? String(hasil.diterima?.status ?? hasil.hasil) : "";
  const tampilan = JUDUL[hasilStatus] ?? JUDUL.tercatat;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-mawar">Cara 1 · Simulasi</p>
      <h1 className="mt-1 font-judul text-4xl font-semibold text-anggur">Simulator Marketplace</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-tinta-lembut">
        Halaman ini berpura-pura menjadi <b>Shopee</b> atau <b>TikTok Shop</b>. Saat order dibuat atau statusnya diubah, simulator mengirim
        <b> notifikasi</b> ke n8n (workflow 04), persis seperti marketplace sungguhan. n8n lalu mengambil detail order, menerjemahkannya,
        dan mencatatnya ke Google Sheets lewat gerbang yang sama dengan toko.
      </p>

      <div className="mt-6"><InfoModeOnline apa="simulator" /></div>

      <div className="mt-2 grid gap-8 lg:grid-cols-[1fr_420px]">
        {/* ---------- Buat order ---------- */}
        <section className="min-w-0 rounded-3xl bg-white p-6 shadow-kartu sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-judul text-xl font-semibold">1. Buat order baru</h2>
            <div className="flex gap-1 rounded-full bg-blush-muda p-1">
              {(["shopee", "tiktok"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatform(p)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${platform === p ? LABEL_PLATFORM[p].kelas : "text-tinta-lembut hover:text-anggur"}`}
                >
                  {LABEL_PLATFORM[p].nama}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm font-medium">Produk</p>
            <button onClick={acakIsi} className="tombol-garis !px-4 !py-1.5 !text-xs">🎲 Acak isi order</button>
          </div>
          <ul className="mt-3 max-h-72 divide-y divide-blush-tua/40 overflow-y-auto rounded-2xl ring-1 ring-blush-tua/60">
            {produk.map((p) => {
              const q = qty[p.sku] ?? 0;
              return (
                <li key={p.sku} className={`flex items-center gap-3 px-4 py-2.5 ${q > 0 ? "bg-blush-muda" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{namaPendek(p.nama)}</p>
                    <p className="font-kode text-[11px] text-tinta-lembut">{p.sku} · {rupiah(p.harga)}</p>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-blush-tua bg-white">
                    <button onClick={() => setQty({ ...qty, [p.sku]: Math.max(0, q - 1) })} className="h-7 w-7 rounded-full text-anggur hover:bg-blush-muda" aria-label={`Kurangi ${p.nama}`}>−</button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{q}</span>
                    <button onClick={() => setQty({ ...qty, [p.sku]: Math.min(20, q + 1) })} className="h-7 w-7 rounded-full text-anggur hover:bg-blush-muda" aria-label={`Tambah ${p.nama}`}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium" htmlFor="sim-nama">Nama penerima</label>
              <input id="sim-nama" className="input mt-1.5" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Nadia Putri" />
            </div>
            <div>
              <label className="block text-sm font-medium" htmlFor="sim-hp">No HP penerima</label>
              <input id="sim-hp" className="input mt-1.5" value={hp} onChange={(e) => setHp(e.target.value)} placeholder="mis. 0812-555-1234" />
            </div>
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-anggur" checked={samarkan} onChange={(e) => setSamarkan(e.target.checked)} />
            <span>
              <b>Samarkan nomor HP</b> seperti API asli (mis. <span className="font-kode">******34</span>).{" "}
              <span className="text-tinta-lembut">Marketplace sering menyembunyikan data pembeli dari aplikasi pihak ketiga.</span>
            </span>
          </label>

          {galat && <p className="mt-4 rounded-xl bg-blush-muda px-4 py-3 text-sm text-anggur-tua">{galat}</p>}

          <button onClick={buat} disabled={mengirim !== null || dipilih.length === 0} className="tombol-utama mt-6 w-full">
            {mengirim === "buat"
              ? "Mengirim notifikasi…"
              : dipilih.length === 0
                ? "Pilih produk dulu"
                : `Kirim notifikasi order ${LABEL_PLATFORM[platform].nama} · ${rupiah(total)}`}
          </button>
          <p className="mt-2 text-center text-xs text-tinta-lembut">
            Order baru dibuat dengan status <b>{platform === "shopee" ? "Perlu dikirim (READY_TO_SHIP)" : "Awaiting shipment"}</b>.
          </p>
        </section>

        {/* ---------- Daftar order simulasi ---------- */}
        <section className="h-fit min-w-0 rounded-3xl bg-blush-muda p-6 ring-1 ring-blush-tua/60">
          <div className="flex items-center justify-between">
            <h2 className="font-judul text-xl font-semibold">2. Ubah status order</h2>
            <button onClick={muatOrder} className="text-xs text-tinta-lembut hover:text-anggur">↻ Muat ulang</button>
          </div>
          <p className="mt-1 text-xs text-tinta-lembut">
            Setiap perubahan status mengirim notifikasi baru. Di sheet, baris order yang sama <b>diperbarui</b>, tidak dobel.
          </p>
          {orders.length === 0 ? (
            <p className="mt-6 text-sm text-tinta-lembut">Belum ada order simulasi.</p>
          ) : (
            <ul className="mt-4 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {orders.map((o) => {
                const k = kunciOrder(o);
                const pilihan = pilihStatus[k] ?? o.status;
                const labelSekarang = STATUS[o.platform].find((s) => s.kode === o.status)?.label ?? o.status;
                return (
                  <li key={k} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${LABEL_PLATFORM[o.platform].kelas}`}>{LABEL_PLATFORM[o.platform].nama}</span>
                      <span className="rounded-full bg-blush px-2.5 py-0.5 text-[11px] font-medium text-anggur">{labelSekarang}</span>
                    </div>
                    <p className="mt-2 break-all font-kode text-xs font-semibold">{o.id}</p>
                    <p className="mt-1 text-xs text-tinta-lembut">
                      {o.nama} · {o.items.map((it) => `${it.qty}× ${it.sku}`).join(", ")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <select
                        value={pilihan}
                        onChange={(e) => setPilihStatus({ ...pilihStatus, [k]: e.target.value })}
                        className="input min-w-0 !rounded-full !py-1.5 !text-xs"
                        aria-label={`Status baru untuk ${o.id}`}
                      >
                        {STATUS[o.platform].map((s) => (
                          <option key={s.kode} value={s.kode}>{s.label} ({s.kode})</option>
                        ))}
                      </select>
                      <button
                        onClick={() => kirim({ aksi: "status", platform: o.platform, order_id: o.id, status: pilihan }, k)}
                        disabled={mengirim !== null}
                        className="tombol-utama shrink-0 !px-4 !py-1.5 !text-xs"
                      >
                        {mengirim === k ? "…" : "Kirim"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {hasil && (
        <div id="hasil-sim" className="mt-10 scroll-mt-24 space-y-6">
          <div className={`rounded-3xl border p-6 ${tampilan.warna}`} role="status">
            <h2 className="font-judul text-2xl font-semibold">{tampilan.judul}</h2>
            <p className="mt-1 text-sm">
              {hasil.pesan ||
                String(hasil.diterima?.alasan ?? "") ||
                (hasil.order ? `${LABEL_PLATFORM[hasil.order.platform].nama} · ${hasil.order.id} · status ${hasil.order.status}` : "")}
            </p>
            {hasilStatus === "tercatat" && hasil.diterima?.status_pesanan != null && (
              <p className="mt-2 text-sm">
                Status di sheet: <b>{String(hasil.diterima.status_pesanan)}</b>
                {(() => {
                  const g = (hasil.diterima?.gerbang as { balasan?: { no_hp_normal?: string } } | undefined)?.balasan;
                  return g && g.no_hp_normal === "" ? " · no HP disamarkan, dicatat tanpa nomor" : "";
                })()}
              </p>
            )}
            {process.env.NEXT_PUBLIC_SHEET_URL && hasilStatus === "tercatat" && (
              <a href={process.env.NEXT_PUBLIC_SHEET_URL} target="_blank" rel="noreferrer" className="tombol-utama mt-5">Buka Google Sheets ↗</a>
            )}
          </div>
          <BalikLayar
            langkah={langkahMarketplace(hasil)}
            http_status={hasil.http_status}
            durasi_ms={hasil.durasi_ms}
            dikirim={hasil.dikirim}
            diterima={hasil.diterima}
            webhook_url={hasil.webhook_url}
            labelKirim="Notifikasi dari marketplace"
            labelTerima="Balasan n8n (workflow 04)"
          />
        </div>
      )}
    </div>
  );
}
