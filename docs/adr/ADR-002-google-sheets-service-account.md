# ADR-002: Order webhook ditulis ke Google Sheets lewat Service Account

- **Status:** Diterima
- **Tanggal:** 2026-11-13
- **Pemutus:** Kevin (pemilik agensi)
- **Mengubah sebagian:** [ADR-001](ADR-001-stack-fondasi.md), baris "Spreadsheet: Google Sheets API langsung" yang dulu ditolak

## Context

ADR-001 menolak Google Sheets API karena setup kredensial Google Cloud terlalu berat **untuk fondasi demo**. Sekarang roadmap tahap berikutnya meminta order dari webhook **langsung tercatat** tanpa input manual. Target klien (seller) bekerja di Google Sheets, jadi di sanalah data harus muncul.

Kebutuhan:
1. Order yang lolos validasi muncul otomatis sebagai baris baru di sheet milik seller.
2. Kiriman ulang order yang sama **tidak boleh** jadi baris dobel.
3. Nomor pesanan TikTok (18 digit) dan nomor HP (`628…`) harus tersimpan utuh.
4. Pengirim harus tahu kalau penulisan gagal.

## Decision

| Aspek | Pilihan | Alasan |
|---|---|---|
| Tujuan tulis | Tab `Order_Masuk` di workbook yang sama (dibuat oleh `build_workbook.py`) | Satu file untuk seller; header dijaga oleh script |
| Autentikasi | **Service Account** (`googleApi`) | Tanpa OAuth consent screen & daftar test user; akses dibatasi ke sheet yang di-share saja |
| Operasi | **Append or Update**, kunci `id_baris` = `no_pesanan\|sku` | Idempoten: kiriman ulang menimpa, tidak menambah. Kunci gabungan karena 1 order bisa berisi banyak produk |
| Cell format | **RAW** | Bawaan `USER_ENTERED` mengubah ID 18 digit jadi angka (presisi 15 digit, digit akhir rusak) |
| Gagal tulis | `onError: continueRegularOutput` → node *Rangkum Hasil* → balas **500** | Order yang hilang tidak boleh dilaporkan "diterima". Dirangkum dulu supaya keranjang multi-produk tetap menghasilkan tepat 1 balasan |
| Keranjang | Field `items[]`, dipecah 1 produk = 1 baris; format lama `sku`+`qty` tetap diterima | Dibutuhkan toko demo (`web/`); kompatibel dengan contoh order workflow 02 |
| Sumber workflow | Dibuat oleh `scripts/build_workflow_03.py` | Kode JS di node bisa dibaca & di-diff; nama kolom sheet & pemetaan diambil dari satu daftar |
| Workflow | File baru `03_…json`, path `/glowra-order-sheets` | Workflow 02 tetap jalan tanpa Google, untuk demo cepat |

## Options Considered

| Alternatif | Kenapa tidak dipilih |
|---|---|
| OAuth2 Google | Di n8n self-host harus membuat OAuth client, consent screen, test user, dan redirect URI. Lebih banyak langkah untuk pemula; token juga bisa kedaluwarsa kalau app masih mode *Testing* |
| n8n Data Table | Tanpa setup, tapi seller tidak melihat datanya di Sheets, padahal itu poin jualannya |
| Operasi Append biasa | Kiriman ulang menghasilkan baris dobel → stok & omzet terhitung dua kali |
| Langsung menulis ke tab `Pesanan` | Tab itu berisi rumus per baris; baris dari API tidak membawa rumus, jadi kolom hitungan kosong. Dipisah dulu supaya aman |

## Consequences

**Positif**
- Order WA/form tercatat otomatis dalam hitungan detik.
- Aman dari kiriman ganda dan dari rusaknya ID panjang.
- Kredensial terpisah dari workflow JSON, jadi file workflow aman di-commit.

**Negatif / risiko**
- Klien perlu akun Google Cloud (gratis) dan sekali setup ±20 menit (`docs/05`).
- File key JSON adalah rahasia; harus disimpan di luar repo (folder `kredensial/` sudah masuk `.gitignore`).
- Ubahan langsung di layar n8n akan tertimpa kalau script dijalankan ulang; ubahan harus dimasukkan ke script.
- Belum diuji end-to-end ke Google sungguhan (butuh kredensial pemilik). Yang sudah diuji di n8n 2.47.4 berjalan: jalur 400, jalur 500 (kredensial palsu), dan jalur 200 dengan node Google diganti simulasi.
