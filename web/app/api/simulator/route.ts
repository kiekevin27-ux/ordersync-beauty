import { NextResponse } from "next/server";
import {
  buatOrder, daftarOrder, detailShopee, detailTiktok, payloadNotifikasi, pulihkanOrder, ubahStatus, type Platform,
} from "@/lib/simulator";
import { pingCekStok } from "@/lib/cekStok";
import { prosesNotifikasi } from "@/lib/marketplace";
import { sheetsTersambung } from "@/lib/sheets";

/**
 * GET  /api/simulator  → daftar order simulasi
 * POST /api/simulator  → { aksi: "buat", platform, items, nama, no_hp, samarkan_hp }
 *                        { aksi: "status", platform, order_id, status, order? }
 * Setiap POST mengirim NOTIFIKASI ke webhook n8n workflow 04, persis seperti marketplace.
 * Tanpa n8n (versi Vercel), notifikasinya diproses lib/marketplace.ts dengan aturan yang sama.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATAS_WAKTU_MS = 30_000;

export function GET() {
  return NextResponse.json({ orders: daftarOrder() });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ hasil: "salah_input", pesan: "Format permintaan tidak valid" }, { status: 400 });
  }
  const platform = body.platform as Platform;
  if (platform !== "shopee" && platform !== "tiktok") {
    return NextResponse.json({ hasil: "salah_input", pesan: "Platform harus shopee atau tiktok" }, { status: 400 });
  }

  // Di Vercel, permintaan berikutnya bisa dilayani "server" lain yang belum kenal order ini.
  // Browser ikut mengirim salinan order, jadi order dipulihkan dulu sebelum statusnya diubah.
  if (body.aksi === "status" && body.order) pulihkanOrder(body.order);

  const o =
    body.aksi === "status"
      ? ubahStatus(platform, String(body.order_id ?? ""), String(body.status ?? ""))
      : buatOrder({
          platform,
          items: Array.isArray(body.items) ? (body.items as { sku: string; qty: number }[]) : [],
          nama: String(body.nama ?? ""),
          no_hp: String(body.no_hp ?? ""),
          samarkan_hp: Boolean(body.samarkan_hp),
        });
  if (typeof o === "string") return NextResponse.json({ hasil: "salah_input", pesan: o }, { status: 400 });

  const notifikasi = payloadNotifikasi(o);
  const url = process.env.N8N_MARKETPLACE_WEBHOOK_URL;
  const dasar = { order: o, dikirim: notifikasi, webhook_url: url ?? null };
  if (!url && sheetsTersambung()) {
    // ---- Mode Vercel: aturan workflow 04, detail order diambil langsung dari data simulator ----
    const mulai = Date.now();
    const h = await prosesNotifikasi(notifikasi as Record<string, unknown>, async (n) =>
      n.platform === "shopee" ? detailShopee([n.order_id!]) : detailTiktok([n.order_id!]),
    );
    if (h.http === 200 && h.balasan.status === "tercatat") await pingCekStok();
    return NextResponse.json({
      ...dasar, webhook_url: "vercel: lib/marketplace.ts", hasil: String(h.balasan.status ?? "tercatat"),
      http_status: h.http, diterima: h.balasan, durasi_ms: Date.now() - mulai, pesan: "",
    });
  }
  if (!url) {
    return NextResponse.json({
      ...dasar, hasil: "tidak_terhubung", http_status: null, diterima: null, durasi_ms: null,
      pesan: "Versi online ini belum tersambung ke n8n (n8n masih berjalan di laptop pemilik demo). Jalankan secara lokal untuk mencoba simulator.",
    }, { status: 503 });
  }

  const mulai = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifikasi),
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
      cache: "no-store",
    });
    const teks = await res.text();
    let diterima: Record<string, unknown> | null = null;
    try {
      diterima = teks ? JSON.parse(teks) : null;
    } catch {
      diterima = { teks_mentah: teks.slice(0, 500) };
    }
    if (res.status === 200) await pingCekStok();
    const hasil =
      res.status === 404 ? "tidak_terhubung" : res.status === 200 ? String(diterima?.status ?? "tercatat") : String(diterima?.status ?? "gagal");
    return NextResponse.json({
      ...dasar, hasil, http_status: res.status, diterima, durasi_ms: Date.now() - mulai,
      pesan: res.status === 404 ? "Webhook workflow 04 tidak ditemukan. Pastikan sudah di-Publish." : "",
    });
  } catch (e) {
    const habis = e instanceof Error && e.name === "TimeoutError";
    return NextResponse.json({
      ...dasar, hasil: "tidak_terhubung", http_status: null, diterima: null, durasi_ms: Date.now() - mulai,
      pesan: habis ? "n8n tidak membalas dalam 30 detik." : "Tidak bisa menghubungi n8n. Pastikan n8n sedang berjalan.",
    }, { status: 502 });
  }
}
