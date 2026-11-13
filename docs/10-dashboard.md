# 10 · Dashboard Pemilik Toko (`/dashboard`)

Satu halaman untuk memantau bisnis dari HP: omzet, order, channel, produk terlaris, dan stok. Datanya dibaca **langsung dari Google Sheet** (`Order_Masuk`, `Stok_Live`, `Master_Produk`) setiap kali halaman dibuka, jadi tidak ada salinan data yang bisa basi.

> **Analogi:** Google Sheet itu **buku besar**, dashboard itu **papan skor** di dinding toko. Papan skor tidak menyimpan apa-apa; ia hanya membacakan angka terbaru dari buku besar.

## Isi dashboard

| Bagian | Isi | Definisi |
|---|---|---|
| **Omzet** | Total rupiah | Order **selesai + dikirim** (sama dengan `Laba_per_Channel` di workbook) |
| Order masuk | Jumlah order | Semua channel, kecuali batal |
| Rata-rata per order | Rupiah | Omzet ÷ jumlah order selesai/dikirim |
| Perlu diproses | Jumlah order | Status baru + diproses, yaitu "PR" admin hari ini |
| Produk perlu restock | x / 15 | Status RESTOCK atau HABIS di `Stok_Live` |
| Omzet per minggu | Grafik kolom | Arahkan kursor/ketuk kolom untuk detail; ada **Lihat sebagai tabel** |
| Omzet per channel & status pesanan | Grafik batang | Angka tertulis di ujung tiap batang |
| 5 produk terlaris | Grafik batang | Unit terjual (selesai + dikirim) |
| Stok | Tabel | Produk bermasalah di paling atas, lencana ✓ AMAN / ! RESTOCK / ✕ HABIS |
| Order terbaru | Tabel | 8 order dengan tanggal pesanan terbaru |

Tombol **Kirim ringkasan stok ke Telegram** memanggil workflow 06 (lihat [`09`](09-stok-dan-notifikasi.md)).

## Cara kerja teknis

- Halaman dirender di **server** (Next.js). Server login ke Google memakai service account dengan izin **hanya baca** (`spreadsheets.readonly`). Kunci tidak pernah dikirim ke browser.
- Tanpa library tambahan: token Google dibuat dengan modul `crypto` bawaan Node (`web/lib/sheets.ts`), dan angka dihitung di `web/lib/dasbor.ts`.
- Grafik digambar sendiri dengan SVG/HTML: satu warna seri (mawar Glowra `#C9184A`, lolos validasi kontras), warna status selalu disertai ikon + label, dan tiap grafik punya angka/label atau tabel supaya tidak bergantung pada warna saja.

## Pengaturan

Di `web/.env.local` (laptop):

```
GOOGLE_SHEET_ID=1sNkN0lpWlXJpLtKMsMJF89Sv_--xajTc5DQ7GlzTgaI
GOOGLE_SERVICE_ACCOUNT_FILE=C:/Users/Kevin/Documents/kunci/glowra-n8n-xxxx.json
```

Di Vercel (online): **Settings → Environment Variables**:
- `GOOGLE_SHEET_ID`: sama seperti di atas
- `GOOGLE_SERVICE_ACCOUNT_JSON`: **isi lengkap** file kunci `.json` (buka dengan Notepad → pilih semua → salin → tempel)

Kalau pengaturan belum diisi, halaman menampilkan pesan *Dashboard belum tersambung* (tidak error).

## Batasan

- Dashboard demo ini **publik** (siapa pun yang tahu link-nya bisa melihat). Untuk klien sungguhan, tambahkan login. Data di demo ini fiktif.
- Setiap kunjungan membaca Google Sheet. Untuk ribuan order atau banyak pengunjung, tambahkan cache beberapa menit supaya tidak kena batas kuota baca Google.
