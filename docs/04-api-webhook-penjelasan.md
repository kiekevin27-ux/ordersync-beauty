# 04 · API, Webhook & n8n

> Tujuan dokumen ini: kamu bisa **menjelaskan** API & webhook ke calon klien dengan bahasa sederhana, lalu **mendemokan** dua workflow n8n yang sudah jadi.

---

## Bagian A: Konsep

### 1. API = pelayan restoran

Bayangkan kamu makan di restoran:

- Kamu (**aplikasi kita**) tidak boleh masuk ke dapur (**database Shopee**).
- Kamu memanggil **pelayan** (**API**), lalu memesan dari **menu** (**daftar endpoint**).
- Pelayan membawa pesananmu ke dapur, lalu kembali membawa makanan (**data**).
- Kalau pesananmu tidak ada di menu, pelayan bilang "maaf, tidak ada" (**error**).

**API (Application Programming Interface)** = "pelayan" yang mengantar permintaan antar-aplikasi dengan aturan yang jelas. Shopee tidak akan memberikan seluruh database-nya, tapi menyediakan API supaya aplikasi lain bisa **meminta data tertentu** dengan cara yang aman.

### 2. Webhook = kurir yang datang sendiri

Kamu menunggu paket. Ada dua cara mengeceknya:

| | **Polling** (nanya terus) | **Webhook** (dikabari) |
|---|---|---|
| Analogi | Kamu telepon kurir tiap 5 menit: *"Paketnya udah sampai belum?"* | Kurir **datang sendiri** mengetuk pintu saat paket tiba |
| Cara kerja | Aplikasi kita bertanya ke API secara berkala | Sistem lain **mengirim** data ke alamat kita saat ada kejadian |
| Kelebihan | Mudah dibuat, kita yang pegang kendali | **Real-time**, hemat (tidak ada pertanyaan sia-sia) |
| Kekurangan | Boros: 99% jawabannya "belum". Ada jeda waktu | Butuh alamat (URL) yang bisa diakses dari internet. Harus siap menerima kapan saja |
| Contoh Glowra | Tiap 10 menit, tanya Shopee: "ada order baru?" | Shopee **memberi tahu** kita begitu ada order baru |

**Webhook** pada dasarnya adalah **API yang dibalik arahnya**. Bukan kita yang bertanya, tapi kita yang **dikabari**.

### 3. Istilah penting

| Istilah | Arti sederhana | Contoh |
|---|---|---|
| **Endpoint** | **Alamat** spesifik di API, seperti satu item di menu | `https://dummyjson.com/products/category/beauty` |
| **Method GET** | "Tolong **ambilkan** data" (hanya membaca) | Ambil daftar produk |
| **Method POST** | "Tolong **terima/simpan** data ini" (mengirim) | Kirim order baru ke webhook |
| **JSON** | Format data yang rapi, mudah dibaca manusia & mesin. Bentuknya `"nama_kolom": nilai` | `{"sku": "GLW-SRM-001", "qty": 2}` |
| **Request** | Permintaan yang kita kirim | "GET produk beauty" |
| **Response** | Jawaban yang kita terima | Daftar 5 produk dalam JSON |
| **API key / token** | **Kartu akses**. Bukti bahwa kita boleh memakai API itu. **Rahasia**, jangan dibagikan atau di-upload ke GitHub | `Authorization: Bearer abc123...` |

**Contoh JSON** (satu produk dari DummyJSON):
```json
{
  "id": 1,
  "title": "Essence Mascara Lash Princess",
  "price": 9.99,
  "stock": 99,
  "brand": "Essence"
}
```
Bandingkan dengan baris CSV: isinya sama, hanya ditulis dengan "label" di setiap nilai.

### 4. Status code: "kode jawaban" dari server

Setiap response membawa **angka 3 digit** yang menjelaskan hasilnya. Seperti kode jawaban pelayan:

| Kode | Arti | Analogi pelayan | Kapan muncul di project ini |
|---|---|---|---|
| **200** OK | Berhasil | "Ini pesanan Anda" | Workflow 01 berhasil ambil produk, workflow 02 menerima order lengkap |
| **400** Bad Request | Permintaan kita **salah/tidak lengkap** | "Maaf, pesanannya kurang jelas, mau ukuran apa?" | Workflow 02 menolak order yang field-nya kosong |
| **401** Unauthorized | **Tidak punya izin** / API key salah | "Maaf, ini area member, mana kartunya?" | Kalau nanti memanggil API Shopee tanpa token yang benar |
| **404** Not Found | **Alamat tidak ada** | "Menu itu tidak ada di restoran kami" | Salah ketik URL webhook, atau workflow belum aktif |
| **429** Too Many Requests | Kebanyakan permintaan, **disuruh pelan-pelan** | "Sabar, dapur lagi penuh, tunggu sebentar" | Polling terlalu sering ke API marketplace (ada batas/rate limit) |
| **500** Server Error | Server-nya yang bermasalah | "Maaf, kompornya rusak" | Ada error di dalam workflow |

Cara gampang mengingat: **2xx = sukses**, **4xx = salah kita**, **5xx = salah server**.

### 5. Hubungannya dengan Glowra Beauty

**Kondisi sekarang (manual):** admin download export CSV dari Shopee & TikTok, copy catatan WA, lalu gabungkan di Excel. Itulah yang kita otomasi di Fase 2–3 dengan script.

**Tahap berikutnya (otomatis penuh):** order masuk langsung tanpa download manual:

| Channel | Jalur resmi | Cara kerja |
|---|---|---|
| **Shopee** | **Shopee Open Platform** (API resmi untuk partner/developer) | Aplikasi kita didaftarkan sebagai *partner app*, lalu **penjual memberi izin** (otorisasi toko). Setelah itu order bisa ditarik via API, atau Shopee mengirim notifikasi via push/webhook |
| **TikTok Shop** | **TikTok Shop Partner Center / Open API** | Mirip: daftar sebagai developer, buat app, minta otorisasi toko, lalu berlangganan event (webhook) order |
| **WhatsApp** | **WhatsApp Business Platform (Cloud API)** dari Meta, atau penyedia resmi (BSP) | Pesan masuk dikirim ke webhook kita. Mengirim pesan follow-up memakai template yang disetujui Meta |

**⚠️ Batasan yang harus jujur disampaikan ke klien (jangan janji berlebihan):**

1. **Butuh akun seller asli & izin dari pemilik toko.** Kita tidak bisa mengakses data toko orang tanpa otorisasi resmi.
2. **Pendaftaran partner/developer harus disetujui platform.** Prosesnya bisa memakan waktu dan **tidak dijamin disetujui**. Syaratnya juga bisa berubah sewaktu-waktu.
3. **Ada batas jumlah request (rate limit).** Kalau dilanggar, muncul **429**.
4. **API & aturan bisa berubah.** Integrasi perlu dirawat, bukan "pasang sekali jadi selamanya".
5. **WhatsApp Business Platform berbayar** per percakapan/pesan (tergantung kategori & negara), dan butuh verifikasi bisnis. **Jangan pakai WA "tembak" / aplikasi tidak resmi** untuk blast pesan, karena berisiko nomor diblokir.
6. **Alternatif realistis untuk toko kecil:** pakai aplikasi omnichannel pihak ketiga yang **sudah** terintegrasi resmi dengan marketplace. Agensi lalu mengotomasi dari data aplikasi itu (export terjadwal atau API mereka).

**Kalimat aman untuk proposal:**
> *"Fondasi data dan alur otomasinya sudah siap. Koneksi langsung ke Shopee/TikTok akan memakai API resmi, setelah toko Anda memberikan otorisasi dan aplikasi integrasi disetujui platform. Sementara itu, sinkronisasi bisa berjalan dari file export rutin."*

---

## Bagian B: Praktik dengan n8n

**n8n** = "papan sambung" otomasi. Setiap kotak (**node**) melakukan satu tugas (ambil data, cek, kirim), dan garis di antaranya menentukan urutan. Mirip Zapier/Make, tapi workflow-nya bisa disimpan sebagai file JSON dan bisa di-host sendiri.

### File di folder `n8n/`

| File | Isi |
|---|---|
| `01_http_request_api_publik.json` | Workflow **GET**: ambil produk beauty dari API publik |
| `02_webhook_order_masuk.json` | Workflow **webhook POST**: terima order, validasi, rapikan no HP, balas JSON |
| `contoh_order_valid.json` | Contoh order lengkap (untuk tes, hasilnya 200) |
| `contoh_order_tidak_valid.json` | Contoh order rusak (untuk tes, hasilnya 400) |
| `03_webhook_ke_google_sheets.json` | Seperti 02, plus **menulis order ke Google Sheets**. Panduan terpisah: [`05-webhook-ke-google-sheets.md`](05-webhook-ke-google-sheets.md) |
| `contoh_order_tiktok.json` | Contoh order TikTok dengan nomor 18 digit (untuk tes workflow 03) |

### Langkah 1: Jalankan n8n (pilih salah satu)

**Opsi A: n8n Cloud (paling gampang, tanpa instal)**
1. Buka **https://n8n.io**, lalu klik **Get started / Start free trial**.
2. Daftar dengan email. Kamu akan mendapat alamat seperti `https://namakamu.app.n8n.cloud`.
3. Trial berlaku terbatas (cek durasinya di halaman pendaftaran). Cukup untuk demo dan screenshot.

**Opsi B: n8n lokal di laptop (gratis, butuh Node.js, sudah terinstal di laptopmu)**
1. Buka terminal (PowerShell), lalu jalankan:
   ```
   npx n8n
   ```
   Pertama kali, npm akan mengunduh n8n (beberapa ratus MB). Di laptop ini **butuh ±17 menit**, jadi sabar saja. Ketik `y` kalau ditanya. Kali berikutnya langsung jalan dalam hitungan detik.
2. Tunggu sampai muncul tulisan `Editor is now accessible via: http://localhost:5678`.
3. Buka **http://localhost:5678** di browser, lalu buat akun owner (lokal saja, tidak dikirim ke mana-mana).
4. **Biarkan terminal tetap terbuka.** Kalau ditutup, n8n berhenti. Untuk mematikan: tekan `Ctrl + C` di terminal.

> Kalau `npx n8n` gagal dengan pesan soal versi Node.js, instal **Node.js versi LTS** dari nodejs.org, atau pakai Opsi A.

### Langkah 2: Import workflow

1. Di n8n, klik **Create Workflow** (atau **+** → Workflow).
2. Klik menu **⋯** (titik tiga) di kanan atas, lalu pilih **Import from File…**
3. Pilih `C:\Users\Kevin\ordersync-beauty\n8n\01_http_request_api_publik.json`.
4. Klik **Save** (atau `Ctrl + S`).
5. Ulangi untuk `02_webhook_order_masuk.json` di workflow baru.

> Cara alternatif: buka file JSON di Notepad, `Ctrl + A` → `Ctrl + C`, lalu klik di kanvas n8n yang kosong dan tekan `Ctrl + V`.

### Langkah 3: Tes workflow 01 (API publik)

1. Buka workflow **Glowra 01 - Ambil Data Produk dari API Publik**.
2. Klik tombol **Execute workflow** (di versi lama namanya *Test workflow*) di bawah kanvas.
3. Semua node berubah **hijau** ✅.
4. Klik node **Ambil Kolom Penting**, lalu lihat panel **Output** (pilih tampilan **Table**).

**Hasil yang seharusnya muncul: 5 produk**, misalnya:

| nama_produk | brand | harga_usd | harga_idr_estimasi | stok | status_stok |
|---|---|---|---|---|---|
| Essence Mascara Lash Princess | Essence | 9.99 | 159840 | 99 | AMAN |
| Eyeshadow Palette with Mirror | Glamour Beauty | 19.99 | 319840 | 34 | RESTOCK |
| … | | | | | |

*(Data DummyJSON bisa sedikit berubah dari waktu ke waktu. `harga_idr_estimasi` memakai kurs asumsi Rp16.000.)*

Node **Tulis ke Google Sheets** sengaja **nonaktif** (abu-abu). Cara mengaktifkannya ada di catatan kuning di kanvas.

### Langkah 4: Tes workflow 02 (webhook)

1. Buka workflow **Glowra 02 - Webhook Order Masuk**.
2. Klik 2× node **Terima Order (Webhook)**, lalu salin **Test URL**-nya:
   - Lokal: `http://localhost:5678/webhook-test/glowra-order-masuk`
   - Cloud: `https://namakamu.app.n8n.cloud/webhook-test/glowra-order-masuk`
3. Klik **Listen for test event**. n8n sekarang menunggu kiriman selama ±2 menit.
4. Buka **terminal baru**, masuk ke folder project, lalu jalankan salah satu perintah di bawah (ganti URL kalau pakai Cloud).

**Windows PowerShell** (pakai `curl.exe`, bukan `curl`, karena di PowerShell `curl` adalah perintah lain):
```powershell
cd C:\Users\Kevin\ordersync-beauty
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-masuk" -H "Content-Type: application/json" --data "@n8n/contoh_order_valid.json"
```

**Git Bash / Mac / Linux** (data langsung di perintah):
```bash
curl -i -X POST "http://localhost:5678/webhook-test/glowra-order-masuk" \
  -H "Content-Type: application/json" \
  -d '{"channel":"whatsapp","no_pesanan":"WA-20261112-01","sku":"glw-srm-001","qty":2,"nama_pembeli":"kak dewi   lestari","no_hp":"+62 812-555-1234"}'
```

**Hasil yang seharusnya muncul** (`-i` membuat status code ikut terlihat):
```
HTTP/1.1 200 OK
...
{
  "status": "diterima",
  "pesan": "Order diterima dan siap diproses",
  "order": {
    "channel": "whatsapp",
    "no_pesanan": "WA-20261112-01",
    "sku": "GLW-SRM-001",
    "qty": 2,
    "nama_pembeli": "Dewi Lestari",
    "no_hp_asli": "+62 812-555-1234",
    "no_hp_normal": "628125551234"
  },
  "diterima_pada": "2026-11-12T..."
}
```
Perhatikan "keajaibannya": `glw-srm-001` jadi `GLW-SRM-001`, `kak dewi   lestari` jadi `Dewi Lestari`, dan `+62 812-555-1234` jadi `628125551234`.

5. **Tes order rusak.** Klik **Listen for test event** lagi (setiap tes butuh klik ulang), lalu jalankan:
```powershell
curl.exe -i -X POST "http://localhost:5678/webhook-test/glowra-order-masuk" -H "Content-Type: application/json" --data "@n8n/contoh_order_tidak_valid.json"
```
Hasil seharusnya:
```
HTTP/1.1 400 Bad Request
...
{
  "status": "ditolak",
  "pesan": "Data order tidak lengkap atau tidak valid",
  "errors": [
    "Field 'nama_pembeli' wajib diisi",
    "Field 'channel' harus salah satu dari: shopee, tiktok, whatsapp",
    "Field 'qty' harus angka bulat lebih dari 0",
    "Field 'sku' harus berformat GLW-XXX-000 (contoh: GLW-SRM-001)",
    "Field 'no_hp' harus berisi 9-15 digit angka"
  ]
}
```

**Kalau ada masalah:**

| Gejala | Penyebab | Solusi |
|---|---|---|
| `404` + pesan *"webhook is not registered"* | Belum klik **Listen for test event**, atau sudah lewat 2 menit | Klik Listen lagi, lalu langsung jalankan curl |
| `curl: (7) Failed to connect` | n8n lokal tidak berjalan | Cek terminal `npx n8n` masih terbuka |
| `Invoke-WebRequest: A parameter cannot be found…` | Mengetik `curl`, bukan `curl.exe`, di PowerShell | Pakai `curl.exe` |
| `curl: (26) Failed to open/read local data` | Terminal tidak berada di folder project | `cd C:\Users\Kevin\ordersync-beauty` dulu |

**Mode produksi (opsional):** klik tombol **Publish** di kanan atas workflow (di n8n versi 1.x namanya toggle **Active**), lalu pakai **Production URL** (`/webhook/` tanpa `-test`). URL ini selalu siap tanpa perlu klik Listen.

> ✅ **Sudah diuji sungguhan** di n8n **2.47.4** (lokal, 12 Nov 2026): workflow 01 menghasilkan 5 produk, dan webhook 02 membalas **200** untuk order valid, **400** untuk order rusak, serta **404** untuk URL yang salah, persis seperti contoh di atas. Kolom `diterima_pada` memakai format waktu internasional (UTC, akhiran `Z`), jadi tambah 7 jam untuk WIB. Ingat: n8n lokal hanya bisa diakses dari laptopmu sendiri. Supaya bisa dipanggil sistem lain dari internet, pakai n8n Cloud atau server.

---

## Bagian C: Screenshot untuk portofolio

Ambil screenshot ini (`Windows + Shift + S`) dan simpan di folder baru `docs/screenshots/`:

| # | Screenshot | Kenapa penting |
|---|---|---|
| 1 | **Kanvas workflow 01** lengkap, semua node hijau | Menunjukkan alur otomasi bisa jalan |
| 2 | **Output tabel** node *Ambil Kolom Penting* (5 produk + status_stok) | Bukti data API berhasil diubah jadi data bisnis |
| 3 | **Kanvas workflow 02** dengan cabang ✅ diterima & ❌ ditolak terlihat | Menunjukkan kamu memikirkan validasi, bukan cuma "jalan" |
| 4 | **Terminal curl** hasil **200** (no HP & nama sudah dirapikan) | Bukti normalisasi data otomatis |
| 5 | **Terminal curl** hasil **400** dengan daftar error | Bukti sistem menolak data buruk dengan pesan jelas |
| 6 | Tab **Executions** di n8n (riwayat eksekusi sukses & gagal) | Menunjukkan sistem bisa diaudit |
| 7 | *(Bonus)* Google Sheets **Laba_per_Channel** dengan **COCOK ✅** | Menghubungkan otomasi ke angka bisnis |

**Tips:** perbesar zoom browser ke 110–125% supaya teks terbaca. Sembunyikan URL n8n Cloud pribadimu, atau pakai versi lokal.
