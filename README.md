# OrderSync Beauty

**Studi kasus: sinkronisasi order Shopee, TikTok Shop & WhatsApp ke pembukuan, stok, dan data pelanggan, untuk toko skincare "Glowra Beauty".**

> ⚠️ **Glowra Beauty adalah toko fiktif.** Semua nama, nomor HP, nomor pesanan, dan angka di repo ini adalah **data dummy** yang dibuat untuk portofolio. Nomor HP memakai pola `08xx-555-xxxx` sebagai penanda fiktif.

---

## 1. Masalah seller

Glowra Beauty jualan di **3 tempat sekaligus**: Shopee, TikTok Shop, dan WhatsApp. Tiga pintu masuk order, tapi hanya **satu gudang** dan **satu buku kas**. Setiap minggu admin:

- Download export Shopee (bahasa Indonesia) dan TikTok (bahasa Inggris), dengan format kolom, tanggal, dan status yang **berbeda**.
- Menyalin order WhatsApp dari chat ke Excel **dengan tangan**: `98rb`, `2 pcs`, `kak dewi`, `sunscren spf50`…
- Menggabungkan semuanya pakai copy-paste. Hasilnya ada **baris dobel**, **SKU salah ketik**, dan **pelanggan sama tercatat jadi beberapa orang** karena nomor HP ditulis `0812…`, `62812…`, `+62 812-…`.
- Menghitung laba dari **harga jual**, padahal yang cair dari marketplace sudah **dipotong fee**.
- Baru sadar stok habis **saat ada pesanan masuk**.

13 titik rawan dipetakan di [`docs/01-peta-alur-bisnis.md`](docs/01-peta-alur-bisnis.md). 10 di antaranya diselesaikan di project ini.

## 2. Solusi

Fondasi data & otomasi dalam 4 lapis:

| Lapis | Yang dilakukan | File |
|---|---|---|
| **1. Gabung & bersihkan** | Satu perintah menggabungkan 3 channel jadi satu tabel seragam: buang duplikat, perbaiki SKU, seragamkan no HP ke `628…`, ubah catatan WA berantakan jadi data terstruktur | [`scripts/clean_merge.py`](scripts/clean_merge.py) |
| **2. Hitung otomatis** | Spreadsheet berisi **rumus asli** (bukan angka mati): HPP, fee marketplace, laba per channel, stok akhir & status RESTOCK | [`sheets/glowra_fondasi.xlsx`](sheets/glowra_fondasi.xlsx) |
| **3. Asumsi terpusat** | Fee marketplace & biaya packing di **satu tempat**. Fee berubah? Ubah satu sel, semua laporan ikut | [`config/asumsi.json`](config/asumsi.json) |
| **4. Order masuk otomatis** | Webhook n8n menerima order, **menolak data tidak lengkap** dengan pesan jelas, merapikan no HP & nama, lalu membalas JSON | [`n8n/`](n8n/) |

## 3. Arsitektur

```mermaid
flowchart LR
    subgraph SUMBER["Sumber Order"]
        SP["🟠 Shopee<br/>export CSV"]
        TT["⚫ TikTok Shop<br/>export CSV"]
        WA["🟢 WhatsApp<br/>catatan admin"]
    end

    subgraph PROSES["Proses Python"]
        CM["clean_merge.py<br/>dedup · SKU · no HP<br/>status · parsing WA"]
        OG[("orders_gabungan.csv<br/>330 baris bersih")]
        BW["build_workbook.py"]
    end

    CFG[/"config/asumsi.json<br/>fee & biaya"/]

    subgraph SHEETS["Google Sheets"]
        XL["glowra_fondasi.xlsx<br/>Pesanan · Stok<br/>Laba_per_Channel"]
        PV["Pivot manual:<br/>omzet bulanan<br/>pelanggan repeat"]
    end

    subgraph N8N["n8n"]
        WH["Webhook POST<br/>/glowra-order-masuk"]
        VAL{"Validasi<br/>field wajib"}
        NORM["Normalisasi<br/>no HP & nama"]
        R200["200 diterima"]
        R400["400 ditolak"]
    end

    SP & TT & WA --> CM --> OG --> BW --> XL --> PV
    CFG --> BW
    SYS["Form / chatbot /<br/>API marketplace"] -->|JSON| WH --> VAL
    VAL -- lengkap --> NORM --> R200
    VAL -- tidak --> R400
    R200 -. "roadmap: tulis otomatis" .-> XL

    classDef src fill:#fde2e4,stroke:#c9184a,color:#111;
    classDef ok fill:#d8f3dc,stroke:#2d6a4f,color:#111;
    classDef bad fill:#fff3b0,stroke:#e09f3e,color:#111;
    class SP,TT,WA src;
    class R200,XL ok;
    class R400 bad;
```

Keputusan teknologi dan alasannya dicatat di [`docs/adr/ADR-001-stack-fondasi.md`](docs/adr/ADR-001-stack-fondasi.md).

## 4. Hasil (dari data dummy, periode 12 Agu s.d. 11 Nov 2026)

### Data yang dibereskan otomatis

| | Jumlah |
|---|---|
| Baris mentah dari 3 channel | **333** |
| Baris duplikat dibuang | **3** |
| SKU salah ketik diperbaiki | **3** |
| Nama produk berspasi berlebih dirapikan | **6** |
| Nomor HP diseragamkan ke `628…` | **210** |
| Catatan WA (teks bebas) dipetakan ke SKU | **30 / 30** |
| **Baris bersih** | **330** (Shopee 200 · TikTok 100 · WA 30) |

### Kinerja per channel (status selesai + dikirim)

| Channel | Order | Omzet | Fee Marketplace | Laba Bersih* | Margin |
|---|---|---|---|---|---|
| Shopee | 160 | Rp18.625.000 | Rp2.062.500 | Rp9.700.500 | 52,1% |
| TikTok Shop | 80 | Rp9.868.000 | Rp789.440 | Rp5.449.560 | 55,2% |
| WhatsApp | 24 | Rp2.659.000 | Rp0 | Rp1.683.000 | 63,3% |
| **Total** | **264** | **Rp31.152.000** | **Rp2.851.940** | **Rp16.833.060** | **54,0%** |

*Laba bersih = omzet − HPP − fee marketplace − packing. Belum termasuk iklan, gaji, dan sewa. Fee memakai **asumsi** di `config/asumsi.json`.

### Insight bisnis

- 💸 **Rp2,85 juta "hilang" ke fee marketplace** dalam 3 bulan. Kalau pembukuan memakai harga jual, laba terlihat sebesar itu lebih besar dari kenyataan.
- 🔁 **21,9% pelanggan repeat order** (55 dari 251 pelanggan unik). **31 di antaranya belanja lintas channel**: tanpa normalisasi nomor HP, mereka terhitung sebagai 2 orang berbeda dan tidak terdeteksi sebagai pelanggan setia.
- 📦 **3 produk perlu RESTOCK**: Niacinamide Serum (sisa 17, min. 25), UV Shield Sunscreen SPF50 (sisa 26, min. 30), Velvet Lip Tint Rosy (sisa 21, min. 25). Niacinamide Serum juga **produk dengan omzet tertinggi** (Rp5,1 juta), jadi produk andalan hampir habis.
- 📅 **Masa gajian (tgl 25–akhir bulan) menyumbang 37% order** padahal hanya ±23% dari jumlah hari. **11.11 jadi hari teramai.** Jadwal restock & promo sebaiknya mengikuti pola ini.
- 💬 **WhatsApp punya margin tertinggi (63%)** karena tanpa fee platform. Alasan kuat untuk mengarahkan pelanggan repeat ke WA.

### Kualitas & verifikasi

- Semua script **deterministik** (seed 42). Dijalankan 2×, hash seluruh file CSV **identik**.
- Workbook dihitung langsung oleh **Excel**: **2.149 rumus, 0 error**. Total omzet di Laba_per_Channel **cocok** dengan tab Pesanan (selisih Rp0), dan semua angka sama dengan hitungan ulang Python.
- Workflow n8n **diuji di n8n 2.47.4**: API publik → 5 produk. Webhook → **200** untuk order valid, **400** untuk order rusak, **404** untuk URL salah.

## 5. Tech stack

| Komponen | Teknologi |
|---|---|
| Generator & cleaning data | Python 3.12 (`csv`, `random`, `re`, tanpa library tambahan) |
| Spreadsheet | `openpyxl` → `.xlsx` → Google Sheets (SUMIFS, COUNTIFS, XLOOKUP, IF) |
| Otomasi | n8n: Manual Trigger, HTTP Request, Split Out, Edit Fields, Webhook, Code, IF, Respond to Webhook |
| Diagram | Mermaid (ter-render langsung di GitHub) |
| Format data | CSV UTF-8 with BOM, JSON |

## 6. Roadmap

| Tahap | Fitur | Nilai untuk seller |
|---|---|---|
| **Berikutnya** | **Follow-up WA otomatis**: pengingat H+25 setelah pembelian (skincare habis ±1 bulan), ucapan terima kasih, minta review. Lewat WhatsApp Business Platform resmi | Repeat order naik tanpa admin harus ingat |
| | Webhook order → **langsung tertulis ke Google Sheets** | Tidak ada lagi input manual order WA |
| | Notifikasi ke owner saat produk masuk status RESTOCK | Tidak kehabisan produk andalan |
| **Menengah** | **Sinkron stok real-time** antar channel via API resmi Shopee & TikTok (butuh otorisasi toko & persetujuan app partner) | Overselling hilang |
| | Rekonsiliasi dana cair vs pesanan selesai | Dana yang "nyangkut" ketahuan |
| **Lanjutan** | **Dashboard** omzet, laba, stok & pelanggan (Looker Studio / web) | Owner pantau bisnis dari HP |
| | Segmentasi pelanggan (baru, repeat, tidur) untuk promo yang tepat sasaran | Biaya promo lebih efisien |

## 7. Cara menjalankan

**Kebutuhan:** Python 3.10+ dan `pip install openpyxl`.

```bash
python scripts/generate_dummy.py   # 1. buat data dummy (seed 42)
python scripts/clean_merge.py      # 2. bersihkan & gabungkan, lalu tampilkan laporan
python scripts/build_workbook.py   # 3. buat sheets/glowra_fondasi.xlsx
```

Lalu:
- Upload `.xlsx` ke Google Sheets, ikuti [`docs/03-panduan-google-sheets.md`](docs/03-panduan-google-sheets.md).
- Import workflow n8n, ikuti [`docs/04-api-webhook-penjelasan.md`](docs/04-api-webhook-penjelasan.md).

## 8. Struktur repo

```
ordersync-beauty/
├── README.md                       ← dokumen ini
├── catatan-belajar.md              ← refleksi pribadi
├── config/asumsi.json              ← fee marketplace & biaya (asumsi)
├── data/
│   ├── master_produk.csv           ← 15 produk
│   ├── raw/                        ← export mentah Shopee, TikTok, WA
│   └── clean/orders_gabungan.csv   ← hasil gabungan bersih
├── scripts/                        ← generate_dummy · clean_merge · build_workbook
├── sheets/glowra_fondasi.xlsx      ← workbook berisi rumus
├── n8n/                            ← 2 workflow + contoh payload tes
└── docs/
    ├── adr/ADR-001-stack-fondasi.md
    ├── 01-peta-alur-bisnis.md
    ├── 02-kamus-data.md
    ├── 03-panduan-google-sheets.md
    └── 04-api-webhook-penjelasan.md
```

---

*Dibuat oleh Kevin, agensi otomasi untuk seller online. Tertarik menerapkan ini di toko Anda? [hubungi kontak agensi]*
