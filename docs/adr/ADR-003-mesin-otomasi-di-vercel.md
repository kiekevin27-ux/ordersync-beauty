# ADR-003: Versi online menjalankan logika workflow di Vercel (tanpa n8n)

- **Status:** Diterima
- **Tanggal:** 2026-11-16
- **Pemutus:** Kevin (pemilik agensi)
- **Mengubah sebagian:** [ADR-001](ADR-001-stack-fondasi.md): n8n tetap jadi mesin di laptop & bahan portofolio, tapi bukan satu-satunya mesin

## Context

Demo online (`web-inky-five-78.vercel.app`) hanya bisa *menampilkan* alur. Order tidak tercatat karena n8n berjalan di laptop. Pemilik ingin alur kerja jalan 24 jam di Vercel, dan bot Telegram bisa diajak chat.

n8n tidak bisa dijalankan di Vercel: n8n adalah server yang harus menyala terus, sedangkan Vercel hanya menjalankan fungsi singkat setiap ada permintaan.

Pilihan yang ditimbang:

| Opsi | Biaya | Kekurangan |
|---|---|---|
| Sewa server n8n (Railway / Render / n8n Cloud) | ±$5–€20 per bulan | Biaya rutin untuk sebuah demo |
| Cloudflare Tunnel ke n8n di laptop | Gratis | Hanya jalan selama laptop menyala |
| **Tulis ulang logika workflow 03/04/06 di Next.js (Vercel)** | **Gratis** | Ada 2 salinan aturan (n8n & TypeScript) yang harus dijaga tetap sama |

## Decision

Logika workflow ditulis ulang di `web/lib/`, dan aturannya disalin **persis** dari kode JS di `scripts/build_workflow_0X.py`:

| Workflow n8n | Versi Vercel | Dipicu oleh |
|---|---|---|
| 03 Gerbang order → Sheets | `lib/gerbang.ts` | `/api/checkout` |
| 04 Notifikasi marketplace | `lib/marketplace.ts` | `/api/simulator` |
| 06 Pemantau stok → Telegram | `lib/stok.ts` + `lib/telegram.ts` | setiap order tercatat, tombol *Cek stok*, Vercel Cron 08:00 WIB |
| *(baru)* Bot Telegram yang bisa diajak chat | `lib/bot.ts` | webhook Telegram → `/api/telegram` |

- **Pemilihan mesin otomatis:** kalau `N8N_*_URL` diisi, website tetap memanggil n8n (mode laptop). Kalau kosong dan kunci Google ada, mesin Vercel yang bekerja.
- **Upsert** ditulis sendiri di `lib/sheets.ts` (`upsertBaris`), meniru node Google Sheets *appendOrUpdate* + auto-map + RAW.
- **Ingatan anti-spam** (static data n8n) disimpan di tab `Memori_Bot`, karena fungsi Vercel tidak punya ingatan antar-panggilan.
- **Jadwal:** paket Hobby Vercel hanya mengizinkan cron 1x sehari, jadi jadwal "tiap 5 menit" diganti dengan pengecekan **setiap ada order** + ringkasan pagi.
- **Simulator:** order simulasi disimpan di memori server. Di Vercel, browser ikut mengirim salinan order saat mengubah status (`pulihkanOrder`).
- **Keamanan bot:** webhook dicek dengan `TELEGRAM_WEBHOOK_SECRET`. Hanya `TELEGRAM_CHAT_ID` yang bisa membaca data toko.
- Workflow 05 (import file export dari Drive) **belum** dipindah. Workflow ini tetap jalan lewat n8n di laptop.

## Consequences

- ✅ Demo online benar-benar mencatat order ke Google Sheet dan mengirim Telegram, tanpa biaya dan tanpa laptop.
- ✅ n8n tetap utuh untuk belajar & portofolio. Laptop cukup memakai `.env.local` yang lama.
- ⚠️ Kalau aturan validasi diubah, ubah di **dua tempat**: `scripts/build_workflow_03.py` dan `web/lib/gerbang.ts`.
- ⚠️ Kunci service account di Vercel sekarang dipakai untuk **menulis** (sebelumnya hanya baca). Akses tetap terbatas pada sheet yang di-share ke robot.
