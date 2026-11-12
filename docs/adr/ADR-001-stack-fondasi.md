# ADR-001: Stack Fondasi OrderSync Beauty

- **Status:** Diterima
- **Tanggal:** 2026-11-12
- **Pemutus:** Kevin (pemilik agensi)

## Context

Project ini adalah portofolio agensi otomasi untuk layanan **sinkronisasi order** dari marketplace (Shopee, TikTok Shop) dan WhatsApp ke pembukuan, stok, dan follow-up pelanggan. Studi kasusnya toko fiktif **Glowra Beauty** (skincare/beauty).

Kebutuhan utamanya:

1. Data contoh harus **bisa dibuat ulang persis sama** supaya angka di README, spreadsheet, dan dokumentasi selalu konsisten.
2. Bentuk data mentah harus **mirip file export asli marketplace** supaya calon klien langsung mengenali masalahnya.
3. Pemilik toko (target klien) umumnya bekerja di **spreadsheet**, bukan di database.
4. Otomasi harus bisa didemokan **tanpa menulis aplikasi penuh**, dan bisa diserahkan ke klien.
5. Diagram harus tampil langsung di GitHub.
6. Fee marketplace **sering berubah**, jadi angka biaya tidak boleh tertanam di dalam kode.

## Decision

| Komponen | Pilihan | Alasan |
|---|---|---|
| Generator data | Python 3 + `random` dengan seed tetap (42) | Hasil bisa diulang persis sama |
| Format data mentah | CSV (UTF-8 with BOM, aman dibuka di Excel/Sheets) | Mirip file export asli marketplace |
| Spreadsheet | File `.xlsx` via `openpyxl`, lalu di-upload ke Google Sheets | Rumus SUMIFS/XLOOKUP tetap jalan di Google Sheets |
| Otomasi | n8n (workflow JSON yang bisa di-import) | Tool no-code standar agensi otomasi |
| Diagram | Mermaid (`.md`) + versi PNG kalau `mmdc` tersedia | Bisa tampil langsung di GitHub |
| Asumsi biaya | Semua di satu file `config/asumsi.json` | Fee marketplace berubah-ubah, jadi tidak di-hardcode |

## Options Considered

| Komponen | Alternatif | Kenapa tidak dipilih |
|---|---|---|
| Generator data | Faker library, atau isi manual di Excel | Faker menambah dependensi, dan nama Indonesia-nya kurang natural. Isi manual tidak bisa diulang dan rawan salah. |
| Format data mentah | JSON, atau langsung `.xlsx` | Export asli Shopee/TikTok berupa file tabel, bukan JSON. CSV lebih mudah di-diff di Git daripada `.xlsx`. |
| Spreadsheet | Google Sheets API langsung, Excel online, database (PostgreSQL) | Sheets API butuh setup kredensial Google Cloud yang berat untuk demo. Database tidak familiar bagi pemilik toko. |
| Otomasi | Zapier, Make (Integromat), script Python murni | Zapier/Make berbayar per task dan workflow-nya tidak bisa di-export jadi file yang rapi di repo. Script murni sulit dirawat klien non-teknis. n8n bisa self-host (murah) dan workflow-nya berupa JSON. |
| Diagram | draw.io, Figma, gambar PNG saja | Tidak bisa di-diff dan tidak ter-render otomatis di GitHub. PNG saja sulit diedit. |
| Asumsi biaya | Konstanta di dalam script, atau tab Excel saja | Konstanta di script harus diubah oleh programmer. Tab Excel saja tidak terbaca oleh script Python. |

## Consequences

**Positif**
- Semua data dan angka bisa dihasilkan ulang dengan satu perintah, jadi hasilnya konsisten di semua dokumen.
- Klien bisa langsung membuka hasilnya di Google Sheets dan melihat rumusnya, tidak ada "kotak hitam".
- Workflow n8n bisa di-import ke akun n8n klien sebagai titik awal implementasi nyata.
- Perubahan fee cukup diedit di satu file JSON.

**Negatif / risiko**
- Butuh Python 3 + `openpyxl` terinstal di komputer yang menjalankan script.
- `openpyxl` hanya menulis rumus tanpa menghitung hasilnya. Nilainya baru muncul saat file dibuka di Excel atau Google Sheets, jadi verifikasi angka harus dihitung terpisah dengan Python.
- Pivot table tidak bisa dibuat otomatis lewat `openpyxl`, jadi harus dibuat manual (ada tutorialnya di `docs/03`).
- XLOOKUP tidak tersedia di Excel versi lama (2016 ke bawah). Google Sheets dan Excel 365 aman.
- Data fiktif tidak menangkap semua keanehan data asli. Saat dipakai klien nyata, aturan cleaning perlu disesuaikan.
- Integrasi API resmi Shopee/TikTok butuh akun seller dan izin partner. Fondasi ini mensimulasikan alurnya, bukan koneksi live.
