import { NextResponse } from "next/server";
import { cariProduk } from "@/lib/produk";
import type { HasilCheckout, PermintaanCheckout } from "@/lib/tipe";

/**
 * POST /api/checkout
 *
 * Jembatan antara website dan n8n. Kenapa browser tidak langsung memanggil n8n?
 *  1. Harga diambil dari master produk DI SERVER, jadi pembeli tidak bisa mengakali harga.
 *  2. Alamat webhook n8n tidak terlihat publik.
 *  3. Tidak ada masalah CORS (browser dilarang memanggil domain lain sembarangan).
 *
 * Validasi nama, no HP, SKU, dan qty SENGAJA diserahkan ke n8n (workflow 03), supaya aturan
 * validasi hanya ada di satu tempat. Website hanya memastikan produknya ada & harganya benar.
 */

const BATAS_WAKTU_MS = 20_000;
const POLA_NO_PESANAN = /^WEB-\d{8}-\d{6}-[A-Z0-9]{3}$/;

function buatNoPesanan(): string {
  // Waktu WIB, contoh: WEB-20261113-140509-K7Q
  const wib = new Date(Date.now() + 7 * 3600_000).toISOString(); // 2026-11-13T14:05:09.123Z
  const tgl = wib.slice(0, 10).replace(/-/g, "");
  const jam = wib.slice(11, 19).replace(/:/g, "");
  const acak = Math.random().toString(36).slice(2, 5).toUpperCase().padEnd(3, "X");
  return `WEB-${tgl}-${jam}-${acak}`;
}

function balas(h: HasilCheckout, status = 200) {
  return NextResponse.json(h, { status });
}

export async function POST(req: Request) {
  const kosong: HasilCheckout = {
    hasil: "salah_input", http_status: null, pesan: "", dikirim: null, diterima: null,
    webhook_url: null, durasi_ms: null,
  };

  let body: PermintaanCheckout;
  try {
    body = await req.json();
  } catch {
    return balas({ ...kosong, pesan: "Format permintaan tidak valid" }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return balas({ ...kosong, pesan: "Keranjang masih kosong" }, 400);
  }

  // Lengkapi tiap item dengan harga resmi dari master produk.
  const items = [];
  for (const it of body.items) {
    const p = cariProduk(String(it?.sku ?? ""));
    if (!p) return balas({ ...kosong, pesan: `Produk ${it?.sku} tidak ditemukan` }, 400);
    items.push({ sku: p.sku, qty: it.qty, harga_satuan: p.harga });
  }

  const noPesanan =
    body.no_pesanan && POLA_NO_PESANAN.test(body.no_pesanan) ? body.no_pesanan : buatNoPesanan();

  const payload = {
    channel: "website",
    no_pesanan: noPesanan,
    nama_pembeli: body.nama_pembeli ?? "",
    no_hp: body.no_hp ?? "",
    items,
  };

  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) {
    return balas({
      ...kosong, hasil: "tidak_terhubung", dikirim: payload,
      pesan: "N8N_WEBHOOK_URL belum diisi. Salin web/.env.example menjadi web/.env.local lalu isi alamat webhook.",
    }, 503);
  }

  const mulai = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(BATAS_WAKTU_MS),
      cache: "no-store",
    });
    const durasi = Date.now() - mulai;
    const teks = await res.text();
    let diterima: Record<string, unknown> | null = null;
    try {
      diterima = teks ? JSON.parse(teks) : null;
    } catch {
      diterima = { teks_mentah: teks.slice(0, 500) };
    }

    const dasar = { http_status: res.status, dikirim: payload, diterima, webhook_url: url, durasi_ms: durasi };
    const pesanN8n = typeof diterima?.pesan === "string" ? diterima.pesan : "";

    if (res.status === 200) return balas({ ...dasar, hasil: "tersimpan", pesan: pesanN8n || "Order tercatat" });
    if (res.status === 400) return balas({ ...dasar, hasil: "ditolak", pesan: pesanN8n || "Data order ditolak" }, 400);
    if (res.status === 404) {
      return balas({
        ...dasar, hasil: "tidak_terhubung",
        pesan: "Webhook tidak ditemukan (404). Pastikan workflow 03 sudah di-Publish, atau kalau memakai /webhook-test/, klik \"Listen for test event\" dulu.",
      }, 502);
    }
    return balas({ ...dasar, hasil: "gagal_simpan", pesan: pesanN8n || `n8n membalas HTTP ${res.status}` }, 502);
  } catch (e) {
    const habisWaktu = e instanceof Error && e.name === "TimeoutError";
    return balas({
      ...kosong, hasil: "tidak_terhubung", dikirim: payload, webhook_url: url, durasi_ms: Date.now() - mulai,
      pesan: habisWaktu
        ? `n8n tidak membalas dalam ${BATAS_WAKTU_MS / 1000} detik.`
        : "Tidak bisa menghubungi n8n. Pastikan n8n sedang berjalan (terminal `npx n8n` masih terbuka).",
    }, 502);
  }
}
