import type { Metadata } from "next";
import Link from "next/link";
import KolomMingguan from "@/components/dasbor/KolomMingguan";
import Batang from "@/components/dasbor/Batang";
import TombolCekStok from "@/components/dasbor/TombolCekStok";
import KelolaOrder from "@/components/dasbor/KelolaOrder";
import { ambilDataDasbor, type DataDasbor } from "@/lib/dasbor";
import { alasanBelumTersambung, sheetsTersambung } from "@/lib/sheets";
import { rupiah } from "@/lib/format";
import { telegramSiap } from "@/lib/telegram";
import { statistik, type StatFU } from "@/lib/followup";
import { DATA_MINIMAL, hitungSiklus, type BarisSiklus } from "@/lib/siklus";
import SiklusPakai from "@/components/dasbor/SiklusPakai";

export const metadata: Metadata = { title: "Dashboard Pemilik · Glowra Beauty (toko demo)" };
export const dynamic = "force-dynamic";

const NAMA_CHANNEL: Record<string, string> = { shopee: "Shopee", tiktok: "TikTok Shop", website: "Website", whatsapp: "WhatsApp" };
const NAMA_STATUS: Record<string, string> = { baru: "Baru", diproses: "Dikemas", dikirim: "Diantar", sampai: "Sampai", selesai: "Selesai", batal: "Batal", retur: "Retur" };

// Warna status (tetap, tidak dipakai untuk seri) — selalu berpasangan ikon + label.
const LENCANA: Record<string, { ikon: string; kelas: string }> = {
  AMAN: { ikon: "✓", kelas: "bg-[#0ca30c]/10 text-[#0b6b0b] ring-[#0ca30c]/40" },
  RESTOCK: { ikon: "!", kelas: "bg-[#fab219]/15 text-[#7a5200] ring-[#fab219]/60" },
  HABIS: { ikon: "✕", kelas: "bg-[#d03b3b]/10 text-[#a32525] ring-[#d03b3b]/50" },
};

function Ubin({ judul, nilai, catatan, sorot }: { judul: string; nilai: string; catatan: string; sorot?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 shadow-kartu ${sorot ? "bg-anggur text-white" : "bg-white"}`}>
      <p className={`text-xs font-medium ${sorot ? "text-blush-tua" : "text-tinta-lembut"}`}>{judul}</p>
      <p className="mt-2 break-words font-judul text-2xl font-semibold tabular-nums">{nilai}</p>
      <p className={`mt-1 text-xs ${sorot ? "text-blush-tua" : "text-tinta-lembut"}`}>{catatan}</p>
    </div>
  );
}

function Kartu({ judul, sub, children, className = "" }: { judul: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-3xl bg-white p-6 shadow-kartu ${className}`}>
      <h2 className="font-judul text-lg font-semibold">{judul}</h2>
      {sub && <p className="mt-0.5 text-xs text-tinta-lembut">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BelumTersambung({ alasan }: { alasan: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-judul text-3xl font-semibold text-anggur">Dashboard belum tersambung</h1>
      <p className="mt-3 text-sm text-tinta-lembut">{alasan}</p>
      <p className="mt-2 text-sm text-tinta-lembut">
        Isi <code className="font-kode">GOOGLE_SHEET_ID</code> dan <code className="font-kode">GOOGLE_SERVICE_ACCOUNT_FILE</code> (laptop) atau{" "}
        <code className="font-kode">GOOGLE_SERVICE_ACCOUNT_JSON</code> (Vercel), lalu deploy ulang. Panduan: <code className="font-kode">docs/11-deploy-vercel.md</code>.
      </p>
      <Link href="/" className="tombol-garis mt-6">← Kembali ke toko</Link>
    </div>
  );
}

export default async function HalamanDasbor() {
  if (!sheetsTersambung()) return <BelumTersambung alasan={alasanBelumTersambung()} />;
  let d: DataDasbor;
  try {
    d = await ambilDataDasbor();
  } catch (e) {
    return <BelumTersambung alasan={`Gagal membaca Google Sheet: ${e instanceof Error ? e.message : "tidak diketahui"}`} />;
  }
  const [fu, siklus] = await Promise.all([
    statistik().catch((): StatFU | null => null),
    hitungSiklus().catch((): BarisSiklus[] | null => null),
  ]);
  const masalah = d.stok.filter((s) => s.status !== "AMAN").sort((a, b) => a.tersedia - a.minimum - (b.tersedia - b.minimum));

  return (
    <div
      className="mx-auto max-w-6xl px-4 py-10"
      style={{ ["--seri" as string]: "#C9184A", ["--grid" as string]: "#F3E3E6", ["--sumbu" as string]: "#D9BFC5", ["--teks" as string]: "#2A1218", ["--teks-lembut" as string]: "#6B4A52" }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-mawar">Untuk pemilik toko</p>
          <h1 className="mt-1 font-judul text-4xl font-semibold text-anggur">Dashboard</h1>
          <p className="mt-2 text-sm text-tinta-lembut">
            Langsung dari Google Sheet (tab <span className="font-kode">Order_Masuk</span> & <span className="font-kode">Stok_Live</span>) · diperbarui {d.diperbarui} WIB
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <TombolCekStok aktif={Boolean(process.env.N8N_CEK_STOK_URL) || telegramSiap()} />
          <Link href="/uji-stok" className="text-xs font-semibold text-mawar underline-offset-2 hover:underline">
            🧪 Uji stok & bot Telegram →
          </Link>
        </div>
      </div>

      {/* ---- Angka utama ---- */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <Ubin sorot judul="Omzet" nilai={rupiah(d.omzet)} catatan="Order dikirim + sampai + selesai" />
        </div>
        <Ubin judul="Order masuk" nilai={d.jumlahOrder.toLocaleString("id-ID")} catatan="Semua channel, tanpa batal" />
        <Ubin judul="Rata-rata per order" nilai={rupiah(d.rataRata)} catatan="Omzet ÷ order dikirim/sampai/selesai" />
        <Ubin judul="Perlu diproses" nilai={d.perluDiproses.toLocaleString("id-ID")} catatan="Order baru + diproses" />
        <Ubin judul="Produk perlu restock" nilai={`${d.perluRestock} / ${d.stok.length}`} catatan="Status RESTOCK atau HABIS" />
      </div>

      <Kartu
        judul="Kelola order website"
        sub="Tandai order toko sendiri: dikemas → diantar (isi kurir & resi) → sampai → selesai. Setiap perubahan dikabari bot Telegram. Order Shopee/TikTok berubah otomatis dari marketplace."
        className="mt-6"
      >
        <KelolaOrder orders={d.orderToko} />
      </Kartu>

      {fu && (
        <Kartu
          judul="Follow-up pelanggan"
          sub="Minta ulasan H+3 setelah paket sampai & pengingat saat produk hampir habis. Hanya pembeli website/WhatsApp yang mengizinkan dihubungi. Daftar dikirim bot Telegram tiap pagi."
          className="mt-6"
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Ubin judul="Perlu dihubungi hari ini" nilai={fu.menunggu.toLocaleString("id-ID")} catatan="Belum ditandai di Telegram" />
            <Ubin judul="Dihubungi bulan ini" nilai={fu.terkirim.toLocaleString("id-ID")} catatan={`${fu.ulasan} ulasan · ${fu.beliUlang} beli ulang`} />
            <Ubin judul="Beli lagi dari pengingat" nilai={fu.berhasil.toLocaleString("id-ID")} catatan="Order lewat link pesan ulang" />
            <Ubin sorot judul="Omzet dari beli ulang" nilai={rupiah(fu.omzetUlang)} catatan="Bulan ini" />
          </div>
          <Link href="/uji-followup" className="mt-4 inline-block text-xs font-semibold text-mawar underline-offset-2 hover:underline">
            🧪 Uji alur follow-up →
          </Link>
        </Kartu>
      )}

      {siklus && (
        <div id="siklus" className="scroll-mt-24">
          <Kartu
            judul="Siklus pakai produk"
            sub={`Berapa hari 1 produk habis dipakai, dasar jadwal pengingat beli ulang. "Data nyata" = median jarak pembelian ulang pelanggan yang sama (per pcs). Saran muncul kalau sudah ada minimal ${DATA_MINIMAL} data dan bedanya ≥15%. Angka juga bisa diubah langsung di tab Lama_Pakai.`}
            className="mt-6"
          >
            <SiklusPakai data={siklus} minimal={DATA_MINIMAL} />
          </Kartu>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Kartu judul="Omzet per minggu" sub="Order dikirim + sampai + selesai, menurut tanggal pesanan">
          <KolomMingguan data={d.mingguan} />
        </Kartu>
        <Kartu judul="Omzet per channel" sub="Order dikirim + sampai + selesai">
          <Batang
            data={d.perChannel.map((c) => ({ label: NAMA_CHANNEL[c.channel] ?? c.channel, sub: `${c.order} order`, nilai: c.omzet }))}
            format={(n) => rupiah(n)}
          />
          <div className="mt-8 border-t border-blush-tua/50 pt-5">
            <h3 className="text-sm font-semibold">Status pesanan</h3>
            <p className="text-xs text-tinta-lembut">Jumlah order per status</p>
            <div className="mt-4">
              <Batang data={d.perStatus.map((s) => ({ label: NAMA_STATUS[s.status] ?? s.status, nilai: s.order }))} format={(n) => `${n} order`} />
            </div>
          </div>
        </Kartu>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Kartu judul="5 produk terlaris" sub="Jumlah unit, order dikirim + sampai + selesai">
          <Batang data={d.topProduk.map((p) => ({ label: p.nama, sub: p.sku, nilai: p.qty }))} format={(n) => `${n} pcs`} />
        </Kartu>

        <Kartu judul="Stok" sub="Dari tab Stok_Live · produk yang perlu perhatian di paling atas">
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-blush-tua/60 text-xs text-tinta-lembut">
                  <th className="py-2 font-medium">Produk</th>
                  <th className="py-2 text-right font-medium">Tersedia</th>
                  <th className="py-2 text-right font-medium">Minimum</th>
                  <th className="py-2 pl-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...masalah, ...d.stok.filter((s) => s.status === "AMAN")].map((s) => {
                  const l = LENCANA[s.status] ?? LENCANA.AMAN;
                  return (
                    <tr key={s.sku} className="border-b border-blush-tua/30">
                      <td className="py-2.5 pr-3">
                        <p className="leading-snug">{s.nama}</p>
                        <p className="font-kode text-[11px] text-tinta-lembut">{s.sku} · dipesan {s.dipesan} · terjual {s.terjual}</p>
                      </td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{s.tersedia}</td>
                      <td className="py-2.5 text-right tabular-nums text-tinta-lembut">{s.minimum}</td>
                      <td className="py-2.5 pl-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${l.kelas}`}>
                          <span aria-hidden>{l.ikon}</span>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Kartu>
      </div>

      <Kartu judul="Order terbaru" sub="8 order dengan tanggal pesanan paling baru" className="mt-6">
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-blush-tua/60 text-xs text-tinta-lembut">
                <th className="py-2 font-medium">Tanggal</th>
                <th className="py-2 font-medium">No pesanan</th>
                <th className="py-2 font-medium">Channel</th>
                <th className="py-2 font-medium">Pembeli</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.terbaru.map((o) => (
                <tr key={o.no_pesanan} className="border-b border-blush-tua/30">
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-tinta-lembut">{o.tanggal}</td>
                  <td className="py-2.5 pr-3 font-kode text-xs">{o.no_pesanan}</td>
                  <td className="py-2.5 pr-3">{NAMA_CHANNEL[o.channel] ?? o.channel}</td>
                  <td className="py-2.5 pr-3">{o.nama}</td>
                  <td className="py-2.5 pr-3">
                    {NAMA_STATUS[o.status_pesanan] ?? o.status_pesanan}
                    {o.no_resi && <span className="block font-kode text-[11px] text-tinta-lembut">{o.kurir} · {o.no_resi}</span>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{o.total ? rupiah(o.total) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Kartu>

      <p className="mt-6 text-xs text-tinta-lembut">
        Definisi omzet sama dengan tab <span className="font-kode">Laba_per_Channel</span> di workbook: hanya order <b>dikirim</b>, <b>sampai</b>, dan <b>selesai</b>. Data
        fiktif untuk demo.
      </p>
    </div>
  );
}
