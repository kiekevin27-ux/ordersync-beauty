# 03 · Panduan Google Sheets: Fondasi Glowra Beauty

> File: `sheets/glowra_fondasi.xlsx` (dibuat oleh `scripts/build_workbook.py`).
> Semua angka hitungan di file ini berupa **rumus asli**, bukan angka mati. Klik sel mana pun berwarna pink untuk melihat rumusnya.

---

## 1. Cara upload `.xlsx` ke Google Sheets

1. Buka **https://drive.google.com**.
2. Klik **+ Baru → Upload file**, lalu pilih `C:\Users\Kevin\ordersync-beauty\sheets\glowra_fondasi.xlsx`.
3. Setelah ter-upload, **klik kanan file → Buka dengan → Google Spreadsheet**.
4. File terbuka dengan label **.XLSX** di sebelah judul, artinya masih format Excel. Pilih **File → Simpan sebagai Google Spreadsheet** supaya jadi file Google Sheets asli yang lebih stabil untuk diedit.
5. Cek bahasa angka: **File → Setelan → Lokal → Indonesia**. Angka akan tampil sebagai `Rp31.152.000` dan persen sebagai `54,0%`.

> 💡 **Kenapa rumusnya kadang terlihat pakai titik koma (`;`)?** Di lokal Indonesia, Google Sheets menampilkan pemisah rumus sebagai `;` (misal `=SUMIFS(N:N;M:M;"YA")`), sedangkan di lokal Inggris pakai `,`. Isinya sama persis, Google yang menerjemahkan otomatis. Di panduan ini saya tulis pakai koma.

**Cara cek file sehat:** buka tab **Laba_per_Channel**, lihat sel **B15**. Harus tertulis **COCOK ✅**.

---

## 2. Peta tab & arti warna

| Tab | Isi | Dari mana datanya |
|---|---|---|
| **Asumsi** | Fee marketplace per channel + biaya packing | `config/asumsi.json` |
| **Master_Produk** | 15 produk: SKU, HPP, harga jual, stok | `data/master_produk.csv` |
| **Pesanan** | 330 pesanan + 6 kolom hitungan + ringkasan total di kolom S–T | `data/clean/orders_gabungan.csv` |
| **Stok** | Stok awal → terjual → stok akhir → AMAN/RESTOCK | Rumus ke Pesanan & Master_Produk |
| **Laba_per_Channel** | Omzet, HPP, fee, packing, laba bersih, margin per channel | Rumus ke Pesanan & Asumsi |

| Warna | Arti |
|---|---|
| 🟥 Header merah tua | Judul kolom data |
| 🟪 Header & sel **pink** | Kolom **berisi rumus**, jangan diketik manual |
| 🟨 Sel **kuning** (tab Asumsi) | **Boleh diubah.** Semua tab lain langsung ikut berubah |

**Aturan penting:** yang dihitung sebagai **penjualan** hanya pesanan berstatus **selesai** dan **dikirim**. Pesanan batal, retur, dan diproses (belum dikirim) tidak masuk omzet. Ini diatur oleh kolom **M "Masuk Laporan?"** di tab Pesanan.

**Hasil yang seharusnya muncul di Laba_per_Channel:**

| Channel | Total Order | Masuk Laporan | Omzet | Total HPP | Total Fee | Packing | Laba Bersih | Margin |
|---|---|---|---|---|---|---|---|---|
| shopee | 200 | 160 | Rp18.625.000 | Rp6.382.000 | Rp2.062.500 | Rp480.000 | Rp9.700.500 | 52,1% |
| tiktok | 100 | 80 | Rp9.868.000 | Rp3.389.000 | Rp789.440 | Rp240.000 | Rp5.449.560 | 55,2% |
| whatsapp | 30 | 24 | Rp2.659.000 | Rp904.000 | Rp0 | Rp72.000 | Rp1.683.000 | 63,3% |
| **TOTAL** | **330** | **264** | **Rp31.152.000** | **Rp10.675.000** | **Rp2.851.940** | **Rp792.000** | **Rp16.833.060** | **54,0%** |

> ⚠️ Margin 50%+ terlihat besar karena model ini **belum** memasukkan biaya iklan, gaji admin, sewa, dan diskon/voucher yang ditanggung toko. Untuk klien asli, biaya-biaya ini ditambahkan di tab Asumsi.

**Insight dari angka ini (bahan cerita ke klien):** dari setiap Rp100.000 penjualan, Shopee "mengambil" sekitar Rp11.000 dan TikTok sekitar Rp8.000, sementara WA Rp0. Kalau pembukuan memakai harga jual, laba akan terlihat **Rp2,85 juta lebih besar** dari kenyataan selama 3 bulan ini.

---

## 3. Penjelasan rumus (bahasa awam)

### 3.1 `SUMIFS`: "jumlahkan, tapi hanya yang memenuhi syarat"

**Analogi:** kamu punya setumpuk struk belanja dan diminta *"jumlahkan total struk, tapi hanya yang dari Shopee DAN yang statusnya YA"*. Kamu menyisir struk satu per satu, mengambil yang cocok, lalu menjumlahkannya. Itulah SUMIFS.

**Pola:**
```
=SUMIFS(kolom_yang_dijumlah, kolom_syarat1, syarat1, kolom_syarat2, syarat2, ...)
```

**Contoh di sheet** (tab Laba_per_Channel, sel **F5** = omzet Shopee):
```
=SUMIFS(Pesanan!$N:$N, Pesanan!$A:$A, $A5, Pesanan!$M:$M, "YA")
```
Artinya: jumlahkan kolom **N (Subtotal)** di tab Pesanan, **hanya** untuk baris yang kolom **A (channel)**-nya sama dengan isi sel A5 ("shopee") **dan** kolom **M**-nya "YA". Hasilnya **Rp18.625.000**.

### 3.2 `COUNTIFS`: "hitung ada berapa, yang memenuhi syarat"

Sama seperti SUMIFS, tapi **menghitung jumlah baris**, bukan menjumlahkan angka.

**Contoh** (Laba_per_Channel, **C5** = order batal Shopee):
```
=COUNTIFS(Pesanan!$A:$A, $A5, Pesanan!$K:$K, "batal")
```
Hasilnya: **16** pesanan Shopee batal.

### 3.3 `XLOOKUP`: "cari di daftar, ambil info di sebelahnya"

**Analogi:** seperti mencari nama di **buku telepon**. Kamu cari namanya di kolom kiri, lalu ambil nomornya di kolom kanan, di baris yang sama.

**Pola:**
```
=XLOOKUP(yang_dicari, kolom_tempat_mencari, kolom_hasil)
```

**Contoh** (tab Pesanan, sel **O2** = HPP pesanan pertama):
```
=F2*XLOOKUP(D2, Master_Produk!$A:$A, Master_Produk!$D:$D)
```
Artinya: ambil SKU di D2 (`GLW-SRM-002`), cari di kolom A Master_Produk, lalu ambil HPP-nya dari kolom D (Rp48.000). Hasilnya dikali qty di F2 (2), jadi **Rp96.000**.

**Contoh lain** (Pesanan, **P2** = fee marketplace):
```
=N2*XLOOKUP(A2, Asumsi!$A$9:$A$11, Asumsi!$B$9:$B$11) + XLOOKUP(A2, Asumsi!$A$9:$A$11, Asumsi!$C$9:$C$11)
```
Cari channel `tiktok` di tabel Asumsi, ambil fee % (8%) lalu kalikan subtotal (Rp270.000), lalu tambah biaya tetap per order (Rp0). Hasilnya **Rp21.600**.

> **Kalau muncul `#N/A`**, artinya yang dicari **tidak ditemukan**. Misalnya ada SKU typo yang belum dibereskan. Itu sebabnya cleaning di Fase 2 penting.

### 3.4 `VLOOKUP`: kakaknya XLOOKUP (versi lama)

VLOOKUP melakukan hal yang sama, tapi caranya lebih kaku:
```
=VLOOKUP(D2, Master_Produk!$A:$G, 4, FALSE)
```
- `Master_Produk!$A:$G` = seluruh tabel, dan **kolom yang dicari wajib paling kiri**.
- `4` = ambil kolom ke-4 dari kiri (D = hpp).
- `FALSE` = harus sama persis. **Jangan lupa ini**, karena tanpa FALSE, VLOOKUP bisa mengambil baris yang "mirip" dan hasilnya salah tanpa peringatan.

| | XLOOKUP | VLOOKUP |
|---|---|---|
| Kolom dicari harus paling kiri? | Tidak | **Ya** |
| Kalau ada kolom disisipkan | Tetap benar | Nomor kolom bisa **bergeser** dan hasilnya salah |
| Tersedia di | Google Sheets, Excel 365/2021+ | Semua versi |

**Kapan pakai VLOOKUP?** Kalau klien masih memakai Excel 2016/2019, yang belum punya XLOOKUP.

### 3.5 `IF` dan `OR`: "kalau…, maka…"

**Contoh** (Stok, **H2** = status stok):
```
=IF(F2<G2, "RESTOCK", "AMAN")
```
Kalau stok akhir (F2) **lebih kecil** dari stok minimum (G2), tulis "RESTOCK". Kalau tidak, tulis "AMAN".

**Contoh** (Pesanan, **M2**):
```
=IF(OR(K2="selesai", K2="dikirim"), "YA", "TIDAK")
```
`OR` = "salah satu saja benar sudah cukup". Kalau statusnya selesai **atau** dikirim, hasilnya "YA".

### 3.6 Rumus pendukung lain

| Rumus | Di mana | Fungsinya |
|---|---|---|
| `=YEAR(C2)&"-"&TEXT(MONTH(C2),"00")` | Pesanan kol. L | Ubah tanggal `2026-08-12` jadi `2026-08` untuk dikelompokkan per bulan. `&` = sambung teks |
| `=F2*G2` | Pesanan kol. N | Subtotal = qty × harga |
| `=N2-O2-P2` | Pesanan kol. Q | Laba kotor = subtotal − HPP − fee |
| `=E5*Asumsi!$B$5` | Laba kol. I | Biaya packing = jumlah order × Rp3.000 |
| `=IF(F5=0,0,J5/F5)` | Laba kol. K | Margin = laba ÷ omzet. `IF` mencegah error `#DIV/0!` kalau omzet 0 |

### 3.7 Apa itu tanda `$`?

`$` artinya **"kunci"**. Saat rumus di-copy ke bawah, `A5` berubah jadi `A6`, `A7`, dan seterusnya. Tapi `$A$9` **tetap** `$A$9`. Analoginya seperti **paku di papan**: yang dipaku tidak ikut bergeser.

---

## 4. Tutorial pivot table (dibuat manual)

> Pivot table tidak bisa dibuat otomatis lewat script, jadi kita buat dengan tangan. **Analogi:** pivot itu seperti **mesin sortir surat otomatis**. Kamu tinggal bilang "kelompokkan per produk, pisahkan per bulan, jumlahkan omzetnya", dan tabel ringkasannya jadi sendiri.

### 4.1 Pivot A: Omzet per produk per bulan

1. Buka tab **Pesanan**, klik sel mana saja di dalam tabel.
2. Menu **Sisipkan → Tabel pivot**.
3. Rentang data: `Pesanan!A1:Q331`. Pilih **Spreadsheet baru**, lalu klik **Buat**.
4. Di panel editor sebelah kanan:
   - **Baris → Tambahkan → `nama_produk`**
   - **Kolom → Tambahkan → `Bulan`**
   - **Nilai → Tambahkan → `Subtotal`**, ringkas menurut **SUM**
   - **Filter → Tambahkan → `Masuk Laporan?`**, lalu centang **hanya "YA"** ❗ (supaya batal/retur tidak ikut)
5. Format angka: blok semua angka, lalu **Format → Angka → Mata uang**.
6. Ganti nama tab pivot jadi `Pivot_Omzet_Bulanan`.

**Cara cek hasilnya benar:** baris **Total Keseluruhan** harus menunjukkan:

| 2026-08 | 2026-09 | 2026-10 | 2026-11 | Total |
|---|---|---|---|---|
| Rp6.150.000 | Rp8.997.000 | Rp13.547.000 | Rp2.458.000 | **Rp31.152.000** |

Contoh baris *Glowra Niacinamide 10% Brightening Serum 20ml*: Rp1.309.000 · Rp833.000 · Rp2.499.000 · Rp476.000.

> Oktober paling besar karena ada **10.10 + gajian**. November kecil karena datanya **hanya sampai tanggal 11**, dan banyak order November masih "diproses" (belum dihitung sebagai penjualan).

### 4.2 Pivot B: Pelanggan repeat order

1. Dari tab **Pesanan**: **Sisipkan → Tabel pivot**, rentang `Pesanan!A1:Q331`, lalu pilih **Spreadsheet baru**.
2. Di editor:
   - **Baris → `no_hp_normal`** (kunci pelanggan, karena nama bisa beda tulisan, nomor HP tidak)
   - **Baris → `nama_pembeli`** (tambahan supaya kelihatan namanya)
   - **Nilai → `no_pesanan`**, ringkas menurut **COUNTA** (= hitung jumlah order)
   - **Nilai → `channel`**, ringkas menurut **COUNTUNIQUE** (= di berapa channel dia belanja)
3. Klik baris `no_hp_normal` di editor, lalu **Urutkan menurut → COUNTA dari no_pesanan → Menurun**. Pelanggan paling setia naik ke atas.
4. Ganti nama tab jadi `Pivot_Repeat`.

**Hitung jumlah pelanggan repeat:** di sel kosong di samping pivot, ketik (ganti `C` dengan kolom COUNTA kalau berbeda):
```
=COUNTIF(C:C, ">1")
```
Hasil seharusnya **55** pelanggan repeat dari **251** pelanggan unik (**21,9%**).

**Cara cek:** 3 teratas masing-masing **4 order**: *Eka Siregar*, *Sinta Amalia*, *Nia Yulianti* (urutan di antara ketiganya bisa berbeda). Komposisinya: 3 orang × 4 order, 18 orang × 3 order, 34 orang × 2 order.

> Pivot ini menghitung **semua** order termasuk yang batal. Untuk versi "pelanggan yang benar-benar beli", tambahkan **Filter → Masuk Laporan? = YA**.

**Kenapa penting untuk klien:** daftar ini adalah **target follow-up WA**. Pelanggan yang sudah 2–4× beli adalah yang paling mungkin beli lagi.

---

## 5. Latihan mandiri

Kerjakan di file Google Sheets kamu. Kunci jawaban ada di bagian paling bawah, jadi **jangan scroll dulu!** 😉

**Latihan 1: SUMIFS dengan 3 syarat**
Berapa omzet **Shopee** di bulan **Oktober 2026** (status selesai + dikirim)? Tulis rumusnya di sel kosong mana saja.
*Petunjuk: tambahkan syarat kolom `Bulan` = "2026-10".*

**Latihan 2: COUNTIFS**
Berapa total pesanan **batal** di **semua channel**? Tulis dengan **satu** rumus COUNTIFS.

**Latihan 3: Simulasi perubahan fee**
TikTok Shop menaikkan fee dari 8% jadi **10%**. Ubah sel kuning di tab Asumsi. Berapa **laba bersih TikTok** sekarang, dan turun berapa rupiah? *(Kembalikan ke 8% setelah selesai.)*

**Latihan 4: XLOOKUP + SUMIFS**
Tambahkan kolom baru **R = "Kategori"** di tab Pesanan, berisi kategori produk yang diambil dari Master_Produk pakai XLOOKUP. Lalu hitung: berapa **unit (qty) produk kategori Serum** yang terjual (selesai + dikirim)?

**Latihan 5: Produk paling laris (omzet)**
Di tab Stok, tambahkan kolom **I = "Omzet"** berisi omzet per SKU (selesai + dikirim). Produk apa yang omzetnya **tertinggi**, dan berapa nilainya?

&nbsp;

&nbsp;

&nbsp;

---

## 🔑 Kunci jawaban

<details>
<summary>Klik untuk membuka kunci jawaban</summary>

**Latihan 1:** **Rp8.249.000**
```
=SUMIFS(Pesanan!N:N, Pesanan!A:A, "shopee", Pesanan!L:L, "2026-10", Pesanan!M:M, "YA")
```

**Latihan 2:** **26** pesanan (Shopee 16 + TikTok 8 + WA 2)
```
=COUNTIFS(Pesanan!K:K, "batal")
```
Cukup satu syarat, karena tidak perlu memfilter channel.

**Latihan 3:** Laba bersih TikTok menjadi **Rp5.252.200**, turun **Rp197.360** dari Rp5.449.560.
Penjelasan: fee naik 2% × omzet TikTok Rp9.868.000 = Rp197.360. Di tab Laba_per_Channel, margin TikTok turun dari 55,2% ke 53,2%. Inilah gunanya fee disimpan di **satu** tempat: cukup ubah satu sel, dan semua laporan ikut.

**Latihan 4:** **82** unit Serum
Rumus di **R2** (lalu copy ke bawah sampai R331):
```
=XLOOKUP(D2, Master_Produk!$A:$A, Master_Produk!$C:$C)
```
Rumus total:
```
=SUMIFS(Pesanan!F:F, Pesanan!R:R, "Serum", Pesanan!M:M, "YA")
```

**Latihan 5:** **Glowra Niacinamide 10% Brightening Serum 20ml (GLW-SRM-001), Rp5.117.000**
Rumus di **I2** tab Stok (copy ke bawah sampai I16):
```
=SUMIFS(Pesanan!$N:$N, Pesanan!$D:$D, $A2, Pesanan!$M:$M, "YA")
```
Lalu cari yang terbesar dengan `=MAX(I2:I16)`, atau urutkan kolom I.
Peringkat 2 & 3: Vitamin C Glow Serum (Rp3.915.000) dan UV Shield Sunscreen SPF50 (Rp3.861.000).
💡 Perhatikan: produk terlaris **juga** berstatus **RESTOCK**. Ini contoh insight yang bisa langsung dijual: "produk andalan Anda hampir habis."

</details>
