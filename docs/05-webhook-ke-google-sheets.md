# 05 · Webhook → Google Sheets (order langsung tercatat)

Workflow **03** melanjutkan workflow 02. Bedanya, order yang lolos validasi **langsung ditulis ke Google Sheet**, dan satu order boleh berisi **banyak produk** (keranjang). Admin tidak perlu lagi menyalin order WhatsApp atau website ke spreadsheet dengan tangan. Toko demo di folder `web/` memakai workflow ini (lihat [`06-toko-demo-website.md`](06-toko-demo-website.md)).

> **Analogi:** workflow 02 itu satpam yang memeriksa tamu lalu bilang "boleh masuk". Workflow 03 adalah satpam yang sama, tapi sekarang dia juga **menulis nama tamu di buku tamu**. Kalau tamu yang sama datang dua kali, namanya tidak ditulis dobel, cukup catatannya yang diperbarui.

---

## Alurnya

```mermaid
flowchart LR
    IN["Order masuk<br/>(POST JSON)"] --> VAL{"Data<br/>valid?"}
    VAL -- tidak --> R400["400 ditolak<br/>(tidak ditulis)"]
    VAL -- ya --> NORM["Rapikan & pecah<br/>1 produk = 1 baris"]
    NORM --> GS["Upsert ke tab<br/>Order_Masuk"]
    GS --> SUM["Rangkum hasil"]
    SUM -- tersimpan --> R200["200 tersimpan"]
    SUM -- gagal --> R500["500 gagal simpan"]

    classDef ok fill:#d8f3dc,stroke:#2d6a4f,color:#111;
    classDef bad fill:#fff3b0,stroke:#e09f3e,color:#111;
    classDef err fill:#fde2e4,stroke:#c9184a,color:#111;
    class R200,GS ok;
    class R400 bad;
    class R500 err;
```

| Node | Tugas |
|---|---|
| **Terima Order (Webhook)** | Pintu masuk di alamat `/glowra-order-sheets` |
| **Validasi Order** | Cek field wajib, channel, nomor HP, lalu **setiap produk** di keranjang: format SKU, qty bulat > 0, harga (opsional), dan SKU tidak boleh muncul dua kali |
| **Data Lengkap?** | Bercabang: valid → lanjut, tidak valid → balas 400 |
| **Normalisasi Data** | `+62 812-555-1234` → `628125551234`, `kak dewi   lestari` → `Dewi Lestari`, jam terima (WIB), lalu keranjang **dipecah**: 3 produk = 3 item |
| **Simpan ke Google Sheets** | Menulis tiap item jadi 1 baris di tab `Order_Masuk`. Kalau `id_baris` sudah ada, baris lama **diperbarui** (tidak dobel) |
| **Rangkum Hasil** | Menggabungkan hasil per baris jadi 1 balasan: total, jumlah produk, dan apakah semuanya tersimpan |
| **Tersimpan? → Balas 200 / 500** | Memberi tahu pengirim apakah order benar-benar tersimpan |

### Format order yang diterima

```json
{
  "channel": "website",
  "no_pesanan": "WEB-20261113-140509-K7Q",
  "nama_pembeli": "kak dewi   lestari",
  "no_hp": "+62 812-555-1234",
  "items": [
    { "sku": "GLW-SRM-002", "qty": 2, "harga_satuan": 135000 },
    { "sku": "GLW-SNS-001", "qty": 1, "harga_satuan": 99000 }
  ]
}
```

- `channel`: `shopee`, `tiktok`, `whatsapp`, atau `website`.
- `harga_satuan` **opsional**. Kalau diisi, kolom `subtotal` ikut dihitung. Kalau tidak, dibiarkan kosong.
- **Format lama (1 produk) tetap diterima**: `"sku": "...", "qty": 2` tanpa `items`. Jadi contoh order dari workflow 02 masih jalan.
- `status_pesanan` (opsional): `baru` (bawaan), `diproses`, `dikirim`, `selesai`, `batal`, `retur`. `tanggal_pesanan` (opsional): `YYYY-MM-DD HH:mm`, bawaannya waktu terima.
- `no_hp` boleh kosong atau disamarkan (`******34`) **khusus** channel `shopee`/`tiktok`, karena API marketplace sering menyembunyikannya.
- **Banyak order sekaligus:** `{ "orders": [ {...}, {...} ] }` (maks 2.000). Semua baris ditulis dalam **satu** panggilan ke Google. Order yang rusak ditolak satu per satu, yang lain tetap tercatat (`status: diterima_sebagian`). Dipakai oleh import file export ([`08`](08-import-export-drive.md)).

### Dua keputusan penting di node Google Sheets

1. **Operasi "Append or Update" berdasarkan `id_baris`** (`no_pesanan|sku`, contoh `WEB-20261113-140509-K7Q|GLW-SRM-002`). Sistem pengirim (chatbot, form, website) kadang mengirim ulang order yang sama, misalnya karena koneksi putus. Kalau operasinya cuma "tambah baris", order itu tercatat dua kali dan stok terhitung dobel. Dengan *upsert*, kiriman ulang hanya menimpa baris yang sama. Kuncinya gabungan no pesanan + SKU karena satu order bisa berisi beberapa produk.
2. **Cell Format = RAW ("Let n8n format").** Bawaannya *USER_ENTERED*, artinya Google menebak tipe data seolah-olah kamu mengetik sendiri. Akibatnya:
   - nomor pesanan TikTok `990065624220109999` (18 digit) diubah jadi angka, dan karena angka di spreadsheet hanya akurat sampai 15 digit, **digit terakhirnya rusak** (`990065624220110000`);
   - nomor HP `628125551234` jadi angka, lalu tampil `6,28E+11`.

   RAW artinya "simpan persis seperti yang dikirim".

### Kenapa ada balasan 500?

Kalau Google sedang bermasalah atau kredensialnya salah, order **tidak tersimpan**. Pengirim harus tahu hal itu supaya bisa mengirim ulang. Membalas "200 diterima" padahal datanya hilang adalah bug paling berbahaya: tidak ada yang sadar ada order yang tercecer.

---

## Setup (sekali saja, ±20 menit)

Ada 3 bagian: **(A)** siapkan Google Sheet, **(B)** buat "akun robot" Google, **(C)** sambungkan ke n8n.

### A. Siapkan Google Sheet

1. Buka **https://drive.google.com**, lalu klik **Baru → Upload file**. Pilih `C:\Users\Kevin\ordersync-beauty\sheets\glowra_fondasi.xlsx`.
2. Klik kanan file yang sudah ter-upload → **Buka dengan → Google Spreadsheet**.
3. Di Google Sheets: **File → Simpan sebagai Google Spreadsheet**. (Penting: n8n hanya bisa menulis ke format Google Sheets asli, bukan ke file `.xlsx`.)
4. Pastikan ada tab **`Order_Masuk`** (header di baris 1). Kolom yang belum ada, misalnya `status_pesanan` dan `tanggal_pesanan`, akan **ditambahkan otomatis** di ujung kanan saat order pertama masuk, karena node Google Sheets memakai mode *auto-map*. Jangan ubah nama header yang sudah ada. **Jangan ubah nama header**, karena n8n mencocokkan kolom berdasarkan nama itu.
5. Salin **URL** sheet dari address bar (`https://docs.google.com/spreadsheets/d/…/edit`).

### B. Buat Service Account ("akun robot" Google)

> **Service account** = akun Google khusus untuk program, bukan untuk manusia. Analoginya kartu akses karyawan: hanya bisa membuka pintu (sheet) yang sengaja kamu bagikan ke dia. Dipilih karena setup-nya lebih pendek daripada OAuth (tidak perlu layar persetujuan dan daftar penguji).

1. Buka **https://console.cloud.google.com** dan login dengan akun Google-mu.
2. Di atas, klik pemilih project → **New Project** → beri nama `glowra-n8n` → **Create**. Pastikan project itu sedang terpilih.
3. Menu **APIs & Services → Library**. Cari **Google Sheets API** → **Enable**. Ulangi untuk **Google Drive API** → **Enable**.
4. Menu **IAM & Admin → Service Accounts** → **Create service account**.
   - Nama: `n8n-glowra` → **Create and continue**.
   - Bagian *role* / *permissions*: **lewati** (klik **Continue** lalu **Done**). Robot ini tidak butuh akses ke seluruh project, cukup ke satu sheet.
5. Klik service account yang baru dibuat → tab **Keys** → **Add key → Create new key → JSON** → **Create**. Sebuah file `.json` otomatis terunduh.
6. Buka file itu dengan Notepad. Kamu butuh 2 isian:
   - `client_email`, contoh `n8n-glowra@glowra-n8n.iam.gserviceaccount.com`
   - `private_key`, teks panjang yang diawali `-----BEGIN PRIVATE KEY-----`

> 🔒 **File JSON ini = kunci rumah.** Siapa pun yang memegangnya bisa menulis ke sheet yang dibagikan ke robot itu. **Jangan taruh di folder project, jangan di-upload ke GitHub, jangan dikirim lewat chat.** Simpan di luar folder repo, misalnya `C:\Users\Kevin\Documents\kunci\`. Kalau sampai bocor: hapus key-nya di tab **Keys**, lalu buat yang baru.

7. Kembali ke Google Sheet (bagian A) → tombol **Bagikan / Share** → tempel `client_email` → peran **Editor** → hilangkan centang "Beri tahu orang" → **Kirim/Share**.

### C. Sambungkan di n8n

1. Jalankan n8n seperti biasa (`npx n8n`, lihat `docs/04`), lalu buka http://localhost:5678.
2. **Import** `C:\Users\Kevin\ordersync-beauty\n8n\03_webhook_ke_google_sheets.json` (menu **⋯ → Import from File…**).
3. Klik dua kali node **Simpan ke Google Sheets**:
   - **Credential** → **Create new credential** → jenis **Google Service Account API**.
     - *Service Account Email*: tempel `client_email`.
     - *Private Key*: tempel isi `private_key` **lengkap** dari `-----BEGIN` sampai `END PRIVATE KEY-----` (tanpa tanda kutip). Kalau teksnya mengandung `\n`, tetap tempel apa adanya; n8n akan merapikannya.
     - **Save**. Kalau muncul ✅ *Connection tested successfully*, berarti beres.
   - **Document**: hapus tulisan `TEMPEL_URL_GOOGLE_SHEET_DI_SINI`, lalu tempel URL sheet dari langkah A.5.
   - **Sheet**: `Order_Masuk` (sudah terisi).
4. Klik **Save** di kanan atas.

---

## Tes

**Cara paling mudah: lewat toko demo.** Ikuti [`06-toko-demo-website.md`](06-toko-demo-website.md): belanja, checkout, lalu lihat barisnya muncul di sheet.

**Cara manual dengan curl:**

1. Klik node **Terima Order (Webhook)** → **Listen for test event**.
2. Buka PowerShell baru, lalu masuk ke folder project:
   ```powershell
   cd C:\Users\Kevin\ordersync-beauty
   ```
3. Kirim order uji satu per satu. **Klik *Listen for test event* lagi sebelum setiap kiriman**, karena mode tes hanya menerima 1 kiriman per klik.

```powershell
# a) Keranjang 3 produk → 200, muncul 3 baris baru
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_keranjang.json"

# b) Order TikTok (nomor 18 digit, format lama 1 produk) → 200, cek nomornya utuh di sheet
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_tiktok.json"

# c) Order rusak → 400, TIDAK ada baris baru
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_tidak_valid.json"
```

4. **Tes anti-dobel:** kirim ulang perintah (a). Jumlah baris di sheet **harus tetap sama**, hanya kolom `diterima_pada_wib` yang berubah.

### Hasil yang benar di tab `Order_Masuk` (setelah a + b)

| diterima_pada_wib | id_baris | channel | no_pesanan | sku | qty | harga_satuan | subtotal | nama_pembeli | no_hp_normal | status |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-13 14:05:09 | WEB-…-K7Q\|GLW-SRM-002 | website | WEB-20261113-140509-K7Q | GLW-SRM-002 | 2 | 135000 | 270000 | Dewi Lestari | 628125551234 | diterima |
| 2026-11-13 14:05:09 | WEB-…-K7Q\|GLW-SNS-001 | website | WEB-20261113-140509-K7Q | GLW-SNS-001 | 1 | 99000 | 99000 | Dewi Lestari | 628125551234 | diterima |
| 2026-11-13 14:05:09 | WEB-…-K7Q\|GLW-LTN-002 | website | WEB-20261113-140509-K7Q | GLW-LTN-002 | 1 | 45000 | 45000 | Dewi Lestari | 628125551234 | diterima |
| 2026-11-13 14:06:30 | 990065624220109999\|GLW-SRM-002 | tiktok | 990065624220109999 | GLW-SRM-002 | 1 | | | Laras Saputri | 628575551548 | diterima |

(Kolom `no_hp_asli` dan `catatan` tidak ditampilkan di tabel ini supaya muat.)

Balasan untuk (a), diringkas:

```json
{
  "status": "diterima",
  "pesan": "Order diterima dan sudah tercatat di Google Sheets",
  "no_pesanan": "WEB-20261113-140509-K7Q",
  "nama_pembeli": "Dewi Lestari",
  "no_hp_normal": "628125551234",
  "jumlah_produk": 3,
  "total_qty": 4,
  "total": 414000,
  "items": [ { "sku": "GLW-SRM-002", "qty": 2, "harga_satuan": 135000, "subtotal": 270000 } ],
  "tersimpan_di_sheet": true,
  "detail_error": null
}
```

### Kalau ada masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| Balasan **500** `gagal_simpan` | Kredensial salah, atau sheet belum dibagikan ke robot | Lihat `detail_error` di balasan, lalu cek langkah B.7: email robot sudah jadi **Editor** di sheet? |
| Error *The caller does not have permission* | Sheet belum di-share ke `client_email` | Ulangi langkah B.7 |
| Error *Google Sheets API has not been used in project…* | API belum di-enable | Ulangi langkah B.3, tunggu 1-2 menit |
| Error *Sheet with name Order_Masuk not found* | Nama tab beda / file masih `.xlsx` | Pastikan sudah *Simpan sebagai Google Spreadsheet* dan nama tab persis `Order_Masuk` |
| Error *Could not find column `id_baris`* | Header baris 1 diubah, atau sheet dibuat dari workbook versi lama | Kembalikan header seperti di langkah A.4 |
| Private key ditolak | Tidak tersalin lengkap | Salin ulang dari `-----BEGIN` sampai `-----END PRIVATE KEY-----` |
| Nomor TikTok berakhiran `0000` | Opsi *Cell Format* berubah jadi *Let Google Sheets format* | Node Google Sheets → **Options → Cell Format → Let n8n format** |

---

## Batasan saat ini (jujur ke klien)

- Belum mengurangi stok. Tab `Order_Masuk` sengaja hanya mencatat; pindah ke tab `Pesanan` (yang berisi rumus HPP, fee, laba) masih dilakukan admin.
- Kalau Google gagal di tengah jalan (misalnya baris 1-2 tertulis, baris 3 gagal), balasannya **500**. Pengirim cukup mengirim ulang: berkat *upsert*, baris yang sudah tertulis tidak jadi dobel.
- n8n lokal hanya bisa dipanggil dari laptop sendiri. Untuk chatbot atau form sungguhan, pakai n8n Cloud atau server (alamatnya berubah dari `localhost:5678` ke domain n8n-mu).
- Workflow ini dibuat oleh `scripts/build_workflow_03.py`. Kalau mengubah node lewat layar n8n, export ulang ke file JSON supaya repo tetap sinkron (atau ubah script-nya lalu jalankan ulang).
