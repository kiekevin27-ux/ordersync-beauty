# 12 · Paket Jasa (cara menjual sistem ini ke klien)

Semua paket di bawah sudah **dibangun dan diuji** di repo ini. Untuk klien nyata, pekerjaannya kebanyakan menyesuaikan: nama kolom export toko mereka, daftar SKU, nomor Telegram, dan Google Sheet milik mereka.

> **Cara menjelaskan ke seller (30 detik):** *"Order dari Shopee, TikTok, dan WA Kakak saya kumpulkan otomatis ke satu Google Sheet. Datanya dirapikan, stok berkurang sendiri, dan Kakak dapat pesan Telegram kalau ada produk yang mau habis. Kakak cukup buka dashboard dari HP."*

---

## Paket A · "Rapikan Data" (paling cepat laku)

**Untuk:** seller yang order-nya tercecer di file export dan catatan WA.

| Yang didapat klien | Dari repo ini |
|---|---|
| Folder Google Drive "kotak surat": upload file export Shopee/TikTok → otomatis bersih & tercatat | Workflow 05, [`docs/08`](08-import-export-drive.md) |
| Google Sheet berisi order gabungan + log setiap import | Workflow 03, tab `Order_Masuk` & `Log_Import` |
| Workbook laba per channel (HPP, fee marketplace, ongkos) | `sheets/glowra_fondasi.xlsx`, [`docs/03`](03-panduan-google-sheets.md) |

**Butuh dari klien:** 1 contoh file export tiap platform, daftar SKU + HPP, akun Google.
**Tidak butuh:** izin API marketplace.

## Paket B · "Stok Aman"

**Untuk:** seller yang pernah oversell atau kehabisan produk andalan.

| Yang didapat klien | Dari repo ini |
|---|---|
| Stok berkurang otomatis dari semua channel (order baru langsung memesan stok) | Tab `Stok_Live`, [`docs/09`](09-stok-dan-notifikasi.md) |
| Notifikasi Telegram saat produk menyentuh minimum, tanpa spam | Workflow 06 |
| Dashboard di HP: omzet, channel, produk terlaris, stok | `/dashboard`, [`docs/10`](10-dashboard.md) |

**Syarat:** Paket A (atau sumber order lain yang sudah masuk ke `Order_Masuk`).

## Paket C · "Order Otomatis Real-time"

**Untuk:** toko dengan website/form/chatbot, atau toko besar yang sudah punya (atau mau mengurus) akses API marketplace.

| Yang didapat klien | Dari repo ini |
|---|---|
| Webhook order dari website / form / chatbot WA, langsung tercatat | Workflow 03, [`docs/05`](05-webhook-ke-google-sheets.md) |
| Integrasi notifikasi Shopee & TikTok: status pesanan selalu terbaru | Workflow 04, [`docs/07`](07-simulator-marketplace.md) |
| n8n online 24 jam (n8n Cloud / server) | [`docs/11`](11-deploy-vercel.md) (bagian *setelah online*) |

**Butuh dari klien:** akun developer/partner marketplace + izin toko (bisa makan waktu), biaya hosting n8n bulanan.

---

## Menentukan harga (isi sendiri)

Belum ada angka di sini; tentukan sesuai pasar dan jam kerjamu. Faktor yang biasanya menentukan:

| Faktor | Contoh pertanyaan ke klien |
|---|---|
| Jumlah channel | Shopee saja, atau Shopee + TikTok + WA + website? |
| Kerapian data | Apakah SKU di semua channel sama? Ada data lama yang perlu dibereskan? |
| Volume order | Puluhan per hari, atau ribuan? (memengaruhi kuota Google & hosting) |
| Biaya pihak ketiga | Hosting n8n bulanan dibayar klien langsung, atau termasuk paket? |
| Perawatan | Apakah ada biaya bulanan untuk perbaikan saat format export marketplace berubah? |

**Saran:** pisahkan **biaya pemasangan** (sekali bayar) dan **biaya perawatan** (bulanan). Format export dan API marketplace rutin berubah, dan perawatan inilah yang menjaga sistem tetap jalan.

## Alur demo ke calon klien (±10 menit)

1. **Masalah** (2 menit): tunjukkan `data/raw/` di Notepad: format beda-beda, SKU typo, nomor HP berantakan.
2. **Pintu masuk** (4 menit):
   - checkout di toko demo dengan *Isi data berantakan*, lalu tunjukkan panel "Di balik layar";
   - simulator: kirim order TikTok, lalu ubah status → Selesai;
   - upload file export ke folder Drive, lalu tunggu 1 menit dan tunjukkan `Log_Import`.
3. **Hasil** (3 menit): Google Sheet `Order_Masuk`, lalu dashboard di HP, lalu pesan Telegram restock.
4. **Penutup** (1 menit): "Mau mulai dari Paket A dulu? Cukup kirim satu file export toko Kakak."
