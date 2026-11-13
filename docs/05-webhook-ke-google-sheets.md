# 05 · Webhook → Google Sheets (order langsung tercatat)

Workflow **03** melanjutkan workflow 02. Bedanya, order yang lolos validasi **langsung ditulis ke Google Sheet**. Admin tidak perlu lagi menyalin order WhatsApp ke spreadsheet dengan tangan.

> **Analogi:** workflow 02 itu satpam yang memeriksa tamu lalu bilang "boleh masuk". Workflow 03 adalah satpam yang sama, tapi sekarang dia juga **menulis nama tamu di buku tamu**. Kalau tamu yang sama datang dua kali, namanya tidak ditulis dobel, cukup catatannya yang diperbarui.

---

## Alurnya

```mermaid
flowchart LR
    IN["Order masuk<br/>(POST JSON)"] --> VAL{"Field wajib<br/>lengkap?"}
    VAL -- tidak --> R400["400 ditolak<br/>(tidak ditulis)"]
    VAL -- ya --> NORM["Rapikan no HP<br/>& nama + waktu WIB"]
    NORM --> GS["Tulis ke tab<br/>Order_Masuk"]
    GS -- berhasil --> R200["200 tersimpan"]
    GS -- gagal --> R500["500 gagal simpan"]

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
| **Validasi Field Wajib** | Sama persis dengan workflow 02: cek 6 field, format SKU, qty, nomor HP |
| **Data Lengkap?** | Bercabang: lengkap → lanjut, tidak lengkap → balas 400 |
| **Normalisasi No HP** | `+62 812-555-1234` → `628125551234`, `kak dewi   lestari` → `Dewi Lestari`, plus jam terima (WIB) |
| **Simpan ke Google Sheets** | Menulis 1 baris ke tab `Order_Masuk`. Kalau `no_pesanan` sudah ada, baris lama **diperbarui** (tidak dobel) |
| **Balas 200 / 500** | Memberi tahu pengirim apakah order benar-benar tersimpan |

### Dua keputusan penting di node Google Sheets

1. **Operasi "Append or Update" berdasarkan `no_pesanan`.** Sistem pengirim (chatbot, form) kadang mengirim ulang order yang sama, misalnya karena koneksi putus. Kalau operasinya cuma "tambah baris", order itu tercatat dua kali dan stok terhitung dobel. Dengan *upsert*, kiriman ulang hanya menimpa baris yang sama.
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
4. Pastikan ada tab **`Order_Masuk`** yang berisi header di baris 1: `diterima_pada_wib`, `channel`, `no_pesanan`, … `catatan`. **Jangan ubah nama header**, karena n8n mencocokkan kolom berdasarkan nama itu.
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

1. Klik node **Terima Order (Webhook)** → **Listen for test event**.
2. Buka PowerShell baru, lalu masuk ke folder project:
   ```powershell
   cd C:\Users\Kevin\ordersync-beauty
   ```
3. Kirim 3 order uji, satu per satu. **Klik *Listen for test event* lagi sebelum setiap kiriman**, karena mode tes hanya menerima 1 kiriman per klik.

```powershell
# a) Order WA valid → 200, muncul 1 baris baru
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_valid.json"

# b) Order TikTok (nomor 18 digit) → 200, cek nomornya utuh di sheet
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_tiktok.json"

# c) Order rusak → 400, TIDAK ada baris baru
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-sheets" -H "Content-Type: application/json" --data "@n8n/contoh_order_tidak_valid.json"
```

4. **Tes anti-dobel:** kirim ulang perintah (a). Jumlah baris di sheet **harus tetap sama**, hanya kolom `diterima_pada_wib` yang berubah.

### Hasil yang benar di tab `Order_Masuk`

| diterima_pada_wib | channel | no_pesanan | sku | qty | nama_pembeli | no_hp_normal | no_hp_asli | status | catatan |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-13 14:05:09 | whatsapp | WA-20261112-01 | GLW-SRM-001 | 2 | Dewi Lestari | 628125551234 | +62 812-555-1234 | diterima | Order diterima dan siap diproses |
| 2026-11-13 14:06:30 | tiktok | 990065624220109999 | GLW-SRM-002 | 1 | Laras Saputri | 628575551548 | 0857-555-1548 | diterima | Order diterima dan siap diproses |

Balasan untuk (a):

```json
{
  "status": "diterima",
  "pesan": "Order diterima dan siap diproses",
  "order": { "channel": "whatsapp", "no_pesanan": "WA-20261112-01", "sku": "GLW-SRM-001", "qty": 2,
             "nama_pembeli": "Dewi Lestari", "no_hp_asli": "+62 812-555-1234", "no_hp_normal": "628125551234" },
  "diterima_pada_wib": "2026-11-13 14:05:09",
  "tersimpan_di_sheet": true
}
```

### Kalau ada masalah

| Gejala | Penyebab | Solusi |
|---|---|---|
| Balasan **500** `gagal_simpan` | Kredensial salah, atau sheet belum dibagikan ke robot | Cek langkah B.7: email robot sudah jadi **Editor** di sheet? |
| Error *The caller does not have permission* | Sheet belum di-share ke `client_email` | Ulangi langkah B.7 |
| Error *Google Sheets API has not been used in project…* | API belum di-enable | Ulangi langkah B.3, tunggu 1-2 menit |
| Error *Sheet with name Order_Masuk not found* | Nama tab beda / file masih `.xlsx` | Pastikan sudah *Simpan sebagai Google Spreadsheet* dan nama tab persis `Order_Masuk` |
| Error *Could not find column `no_pesanan`* | Header baris 1 diubah | Kembalikan header seperti di langkah A.4 |
| Private key ditolak | Tidak tersalin lengkap | Salin ulang dari `-----BEGIN` sampai `-----END PRIVATE KEY-----` |
| Nomor TikTok berakhiran `0000` | Opsi *Cell Format* berubah jadi *Let Google Sheets format* | Node Google Sheets → **Options → Cell Format → Let n8n format** |

---

## Batasan saat ini (jujur ke klien)

- **1 order = 1 baris = 1 SKU.** Order WA berisi 3 produk sekarang harus dikirim sebagai 3 order dengan `no_pesanan` berbeda (misalnya `WA-…-01a`, `-01b`). Versi berikutnya: kunci gabungan `no_pesanan + sku`.
- Belum mengurangi stok atau menghitung harga. Tab `Order_Masuk` sengaja hanya mencatat; pindah ke tab `Pesanan` (yang berisi rumus) masih dilakukan admin.
- n8n lokal hanya bisa dipanggil dari laptop sendiri. Untuk chatbot atau form sungguhan, pakai n8n Cloud atau server (alamatnya berubah dari `localhost:5678` ke domain n8n-mu).
