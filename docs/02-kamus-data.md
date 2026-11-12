# 02 · Kamus Data Glowra Beauty

> Semua data di project ini **FIKTIF**, dibuat oleh `scripts/generate_dummy.py` dengan seed **42**. Hasilnya selalu sama persis setiap kali script dijalankan.

**Analogi:** kamus data itu seperti **legenda di peta**. Tanpa legenda, kita tidak tahu garis biru itu sungai atau jalan tol. Tanpa kamus data, kita tidak tahu kolom `Harga Awal` itu harga sebelum diskon atau sesudahnya.

---

## 1. Daftar file

| File | Isi | Baris data | Dibuat oleh |
|---|---|---|---|
| `data/master_produk.csv` | Daftar 15 produk + HPP, harga, stok | 15 | `generate_dummy.py` |
| `data/raw/shopee_orders.csv` | Export pesanan Shopee (bahasa Indonesia) | **202** = 200 pesanan + 2 baris duplikat | `generate_dummy.py` |
| `data/raw/tiktok_orders.csv` | Export pesanan TikTok Shop (bahasa Inggris) | **101** = 100 pesanan + 1 baris duplikat | `generate_dummy.py` |
| `data/raw/whatsapp_orders.csv` | Catatan manual admin WA (berantakan) | 30 | `generate_dummy.py` |
| `data/clean/orders_gabungan.csv` | Gabungan 3 channel, sudah bersih & seragam | **330** | `clean_merge.py` |

**Aturan umum data:**
- **Encoding:** UTF-8 with BOM, jadi aman dibuka di Excel tanpa huruf aneh.
- **Rentang tanggal:** 12 Agustus 2026 s.d. 11 November 2026, sekitar 3 bulan. Sengaja **dikunci** (bukan "3 bulan dari hari ini") supaya hasilnya tidak berubah kalau script dijalankan bulan depan.
- **Pola keramaian:** order lebih banyak di tanggal kembar (9.9, 10.10, **11.11 = hari teramai, 17 order**) dan di masa gajian (tgl 25 s.d. akhir bulan: **37% order** terjadi di **~23% hari**).
- **Satu baris = satu pesanan = satu jenis produk.** Penyederhanaan supaya rumus mudah dipelajari. Di data asli, satu pesanan bisa berisi beberapa produk (beberapa baris dengan nomor pesanan sama).
- **Semua uang dalam Rupiah, tanpa titik/koma** (contoh: `119000`), kecuali di file WA yang memang berantakan.

**Penanda bahwa data ini fiktif:**

| Data | Pola fiktif | Contoh |
|---|---|---|
| No HP | Selalu `08xx-555-xxxx` ("555" = penanda nomor fiktif) | `0812-555-1234` |
| No. Pesanan Shopee | `YYMMDD` + **`DM`** (DuMmy) + 6 karakter | `261111DM5F5NKS` |
| Order ID TikTok | 18 digit, selalu diawali **`9900`** | `990065624220102762` |
| Nama pembeli | Kombinasi acak nama depan + belakang | `Laras Saputri` |

---

## 2. `master_produk.csv`

| Kolom | Tipe | Arti | Contoh |
|---|---|---|---|
| `sku` | teks | Kode unik produk. Format `GLW-[KATEGORI 3 huruf]-[nomor 3 digit]` | `GLW-SRM-001` |
| `nama_produk` | teks | Nama resmi produk (acuan untuk semua channel) | `Glowra Niacinamide 10% Brightening Serum 20ml` |
| `kategori` | teks | Serum, Toner, Sunscreen, Moisturizer, Facial Wash, Lip Tint, Masker, Paket | `Serum` |
| `hpp` | angka (Rp) | **Harga Pokok Penjualan** = modal per unit (bahan + kemasan + produksi) | `42000` |
| `harga_jual` | angka (Rp) | Harga jual per unit sebelum potongan marketplace | `119000` |
| `stok_awal` | angka | Stok di gudang pada awal periode (12 Agu 2026) | `60` |
| `stok_minimum` | angka | Batas aman. Kalau stok akhir **di bawah** angka ini, status jadi RESTOCK | `25` |

Kode kategori: `SRM` serum · `TNR` toner · `SNS` sunscreen · `MST` moisturizer · `FWS` facial wash · `LTN` lip tint · `MSK` masker · `SET` paket.

---

## 3. `raw/shopee_orders.csv` (meniru export Shopee)

| Kolom | Arti | Contoh | → Kolom bersih |
|---|---|---|---|
| `No. Pesanan` | Nomor pesanan unik | `261111DM5F5NKS` | `no_pesanan` |
| `Status Pesanan` | Status (lihat tabel status di bagian 7) | `Perlu Dikirim` | `status_normal` |
| `Waktu Pesanan Dibuat` | Tanggal & jam order, format `YYYY-MM-DD HH:MM` | `2026-11-11 23:02` | `tanggal` |
| `SKU Induk` | Kode produk | `GLW-MST-002` | `sku` |
| `Nama Produk` | Nama produk | `Glowra Oil Control Gel Moisturizer 50g` | `nama_produk` |
| `Jumlah` | Jumlah unit dibeli | `3` | `qty` |
| `Harga Awal` | Harga per unit sebelum diskon | `85000` | `harga_satuan` |
| `Ongkos Kirim Dibayar oleh Pembeli` | Ongkir yang dibayar pembeli. `0` = gratis ongkir | `15000` | `ongkir` |
| `Username (Pembeli)` | Username akun Shopee pembeli | `ichasafitri60` | *(tidak dipakai)* |
| `Nama Penerima` | Nama penerima paket | `Icha Safitri` | `nama_pembeli` |
| `No. Telepon` | No HP penerima, kebanyakan format `62…` | `628955554010` | `no_hp_normal` |

Urutan baris: **terbaru di atas**, seperti export asli.

## 4. `raw/tiktok_orders.csv` (meniru export TikTok Shop)

| Kolom | Arti | Contoh | → Kolom bersih |
|---|---|---|---|
| `Order ID` | Nomor pesanan, 18 digit | `990065624220102762` | `no_pesanan` |
| `Order Status` | Status dalam bahasa Inggris | `Completed` | `status_normal` |
| `Created Time` | Format **`DD/MM/YYYY HH:MM:SS`** (hari dulu, beda dengan Shopee!) | `12/08/2026 00:40:50` | `tanggal` |
| `Seller SKU` | Kode produk | `GLW-SRM-002` | `sku` |
| `Product Name` | Nama produk | `Glowra Vitamin C Glow Serum 20ml` | `nama_produk` |
| `Quantity` | Jumlah unit | `2` | `qty` |
| `SKU Unit Original Price` | Harga per unit sebelum diskon | `135000` | `harga_satuan` |
| `Shipping Fee` | Ongkir dibayar pembeli | `9000` | `ongkir` |
| `Buyer Username` | Username TikTok | `laras_sapu268` | *(tidak dipakai)* |
| `Recipient` | Nama penerima, kadang HURUF KAPITAL semua | `Laras Saputri` | `nama_pembeli` |
| `Phone #` | No HP, kebanyakan format `(+62)8…` | `(+62)8575551548` | `no_hp_normal` |

Urutan baris: **terlama di atas**.

## 5. `raw/whatsapp_orders.csv` (catatan manual admin)

Ini meniru admin yang mencatat order dari chat WA ke spreadsheet **tanpa aturan baku**. Isinya sengaja berantakan.

| Kolom | Arti | Contoh variasi yang muncul | → Kolom bersih |
|---|---|---|---|
| `No` | Nomor urut catatan admin | `1`, `2`, … | bagian dari `no_pesanan` (`WA-20260814-01`) |
| `Tgl` | Tanggal order, **tanpa jam**, 3 format campur | `23/8/2026`, `14-08-26`, `22 Agu 2026` | `tanggal` |
| `Nama` | Nama pembeli, kadang pakai sapaan / huruf kecil | `Maya Oktaviani`, `kak dewi lestari`, `dian wijaya` | `nama_pembeli` |
| `No WA` | No HP, 5 format campur | `0813 555 4640`, `0812-555-1234`, `+62 812-555-1234` | `no_hp_normal` |
| `Pesanan` | **Sebutan produk versi admin** (bukan SKU, ada typo) | `serum vit c`, `sunscren spf50`, `liptint rosy` | `sku` + `nama_produk` |
| `Jml` | Jumlah, kadang ada satuan | `1`, `1pc`, `2 pcs`, `x2` | `qty` |
| `Total` | Total harga (qty × harga), 4 format | `49000`, `Rp135.000`, `98rb`, `Rp 49.000,-` | `harga_satuan` (= total ÷ qty) |
| `Ongkir` | Ongkir, angka atau kata | `15000`, `Rp9.000`, `12rb`, `free`, `gratis`, `-` | `ongkir` |
| `Bayar` | Status transfer (info saja) | `lunas`, `LUNAS`, `udh tf`, `lunas (BCA)`, `blm tf` | *(tidak dipakai)* |
| `Status` | Status order versi admin | `sdh sampai`, `otw`, `gajadi`, `retur - rusak` | `status_normal` |
| `Catatan` | Catatan bebas | `minta bubble wrap tebal`, `repeat order` | *(tidak dipakai)* |

---

## 6. `clean/orders_gabungan.csv` (hasil akhir, siap dipakai)

| Kolom | Tipe | Arti | Contoh |
|---|---|---|---|
| `channel` | teks | Asal order: `shopee`, `tiktok`, atau `whatsapp` | `tiktok` |
| `no_pesanan` | teks | Nomor pesanan asli. Order WA dibuatkan nomor `WA-YYYYMMDD-NN` | `WA-20260814-01` |
| `tanggal` | tanggal `YYYY-MM-DD` | Tanggal order. **Jam dibuang** karena WA tidak punya jam dan laporan cukup per hari | `2026-08-12` |
| `sku` | teks | SKU yang **sudah diperbaiki** & pasti ada di Master Produk | `GLW-SRM-002` |
| `nama_produk` | teks | Nama **resmi dari Master Produk** (bukan dari channel), jadi pasti seragam | `Glowra Vitamin C Glow Serum 20ml` |
| `qty` | angka | Jumlah unit | `2` |
| `harga_satuan` | angka (Rp) | Harga jual per unit | `135000` |
| `ongkir` | angka (Rp) | Ongkir dibayar pembeli. **Bukan omzet toko**, karena diteruskan ke kurir | `9000` |
| `nama_pembeli` | teks | Nama rapi, Huruf Awal Kapital, tanpa sapaan "kak" | `Laras Saputri` |
| `no_hp_normal` | teks | No HP format **`628…`**. **Ini kunci untuk mengenali pelanggan yang sama** lintas channel | `628575551548` |
| `status_normal` | teks | Salah satu dari: `selesai`, `dikirim`, `diproses`, `batal`, `retur` | `selesai` |

Urutan baris: tanggal → channel → no_pesanan.

> ⚠️ **Tips buka di Excel:** Excel suka "sok pintar". Nomor `628575551548` bisa berubah jadi `6,28576E+11`, dan Order ID TikTok yang 18 digit bisa terpotong. Supaya aman, buka lewat **Data → From Text/CSV** dan set kolom tersebut sebagai **Text**, atau langsung pakai Google Sheets / file `.xlsx` di Fase 3.

---

## 7. Penyeragaman status

| `status_normal` | Arti | Shopee | TikTok | WhatsApp (variasi admin) |
|---|---|---|---|---|
| `selesai` | Barang diterima, transaksi tuntas | Selesai | Completed | selesai, Done, SELESAI, sdh sampai, udah diterima |
| `dikirim` | Sudah di kurir, dalam perjalanan | Sedang Dikirim | Shipped | dikirim, otw, udh dikirim |
| `diproses` | Sudah bayar, belum dikirim | Perlu Dikirim | Awaiting Shipment | blm dikirim, proses, nunggu packing |
| `batal` | Dibatalkan | Batal | Cancelled | batal, cancel, gajadi |
| `retur` | Barang dikembalikan / refund | Pengembalian Barang/Dana | Returned | retur, retur - rusak, retur - salah warna |

**Komposisi status di data bersih:**

| Channel | selesai | dikirim | diproses | batal | retur | Total |
|---|---|---|---|---|---|---|
| Shopee | 140 (70%) | 20 | 14 | 16 | 10 | 200 |
| TikTok | 70 (70%) | 10 | 7 | 8 | 5 | 100 |
| WhatsApp | 21 (70%) | 3 | 2 | 2 | 2 | 30 |

Pesanan berstatus `diproses` & `dikirim` selalu yang **paling baru**, karena order lama wajarnya sudah selesai.

---

## 8. Data kotor yang sengaja disisipkan

Ini "jebakan" untuk membuktikan script cleaning bekerja. Semuanya tercatat supaya bisa dicek satu per satu.

| # | Channel | Jenis | No. Pesanan | Detail |
|---|---|---|---|---|
| 1 | Shopee | SKU typo | `260902DM98VA5U` | `GLW-SRM-001` ditulis `GLW-SRM-01` (kurang satu nol) |
| 2 | Shopee | SKU typo | `261017DMMWHY84` | `GLW-SRM-001` ditulis `GLW-SRM-01` |
| 3 | TikTok | SKU typo | `990046651364424936` | `GLW-SNS-001` ditulis `GLW-SNS001` (tanda `-` hilang) |
| 4 | Shopee | Spasi berlebih | `260925DMXDL2AF` | `Glowra UV Shield␣␣Sunscreen SPF50 PA++++ 50ml␣` |
| 5 | Shopee | Spasi berlebih | `260829DMDDYKGJ` | `Glowra Hydrating Sheet␣␣Mask isi 5` |
| 6 | Shopee | Spasi berlebih | `260825DMSZ663A` | `Glowra␣␣Retinol 0.3% Night Serum 20ml` |
| 7 | Shopee | Spasi berlebih | `260909DM43EFLX` | `Glowra␣␣Vitamin C Glow Serum 20ml␣␣` |
| 8 | TikTok | Spasi berlebih | `990058273902196207` | `Glowra Tone Up Sunscreen␣␣SPF35 40ml␣␣` |
| 9 | TikTok | Spasi berlebih | `990094672324876329` | `Glowra␣␣UV Shield Sunscreen SPF50 PA++++ 50ml␣` |
| 10 | Shopee | Baris duplikat | `260826DMP9F7DZ` | Baris yang sama muncul 2× |
| 11 | Shopee | Baris duplikat | `261012DMW2H2SU` | Baris yang sama muncul 2× |
| 12 | TikTok | Baris duplikat | `990061032664214764` | Baris yang sama muncul 2× |

(`␣` = spasi)

Selain 12 jebakan khusus di atas, ada juga **kekotoran yang menyebar** (seperti data asli):
- **No HP 7 format berbeda** di semua channel: `628…`, `08…`, `+62 8xx-xxx-xxxx`, `(+62)8…`, `+628…`, `08xx-xxx-xxxx`, `08xx xxx xxxx`.
- **Nama pembeli** kadang HURUF KAPITAL (TikTok), huruf kecil, atau pakai "kak" (WA).
- **Seluruh catatan WA**: tanggal, produk, qty, harga, dan status dalam bentuk teks bebas.

---

## 9. Hasil cleaning (`clean_merge.py`)

| Perbaikan | Jumlah |
|---|---|
| Baris duplikat dibuang | **3** (2 Shopee, 1 TikTok) |
| SKU typo diperbaiki | **3** |
| Spasi nama produk dirapikan | **6** |
| No HP diseragamkan ke `628…` | 210 dari 333 baris mentah |
| Nama pembeli dirapikan | 24 |
| Produk WA dipetakan ke SKU | 30 dari 30 (0 gagal) |
| **Total baris** | **333 mentah → 330 bersih** (Shopee 200, TikTok 100, WA 30) |

**Pelanggan** (dikenali dari `no_hp_normal`):
- **251** pelanggan unik.
- **55 pelanggan repeat** (belanja lebih dari sekali) = **21,9%**.
- **31 pelanggan lintas channel**, misalnya pernah beli di Shopee **dan** di WA. Tanpa normalisasi nomor HP, mereka akan terhitung sebagai 2 orang berbeda.

**Cara kerja tiap perbaikan (bahasa awam):**
- **Duplikat:** kalau ada dua baris dengan channel + nomor pesanan + SKU yang sama, baris kedua dibuang.
- **SKU:** hapus spasi, jadikan huruf besar, lalu susun ulang jadi pola `GLW-XXX-000`. Hasilnya dicek ke Master Produk, dan kalau tidak ada, script **berhenti dengan pesan error**, tidak diam-diam lanjut.
- **Nama produk:** selalu diambil dari Master Produk berdasarkan SKU, jadi spasi berlebih otomatis hilang.
- **No HP:** buang semua karakter selain angka. Awalan `0` diganti `62`, awalan `8` ditambah `62`, awalan `62` dibiarkan.
- **Produk WA:** dicari kata kuncinya (contoh: ada kata "niacin" → `GLW-SRM-001`, ada "rosy" → `GLW-LTN-001`). Kalau tidak ada kata kunci yang cocok, script berhenti dan menunjukkan teks yang gagal.
- **Harga WA:** teks seperti `98rb` atau `Rp 49.000,-` diubah jadi angka, lalu dibagi qty. Hasilnya dicocokkan ke harga master dan muncul peringatan kalau beda (hasil sekarang: 0 peringatan).
