# 11 · Online-kan Toko Demo & Dashboard (Vercel)

Tujuan: toko demo + dashboard punya **link publik** (misalnya `ordersync-glowra.vercel.app`) yang bisa dibagikan ke calon klien, gratis, dan otomatis ter-update setiap kali repo di-push.

## Apa yang jalan online, apa yang belum

| Bagian | Online (Vercel) | Keterangan |
|---|---|---|
| Beranda, katalog, keranjang | ✅ | Penuh |
| **Dashboard** (`/dashboard`) | ✅ | Membaca Google Sheet asli. Kalau n8n di laptop menyala, data baru ikut tampil |
| Checkout & simulator | ⚠️ Mode tampilan | Ada pemberitahuan *"belum tersambung ke n8n"*. Order tidak tercatat |
| n8n (workflow 03–06) | ❌ Masih di laptop | Butuh hosting n8n (n8n Cloud / server). Diputuskan nanti saat ada klien |

Begitu n8n online, cukup isi alamat webhook-nya di Environment Variables Vercel dan semua fitur aktif, tanpa ubah kode.

## Langkah deploy (±10 menit, sekali saja)

1. Buka **https://vercel.com** dan login dengan akun yang terhubung ke GitHub **kiekevin27-ux** (akun yang sama dengan deploy Ascendom).
2. Klik **Add New… → Project**.
3. Di daftar repo GitHub, cari **ordersync-beauty** → **Import**.
   *Kalau repo tidak muncul:* klik **Adjust GitHub App Permissions**, lalu beri Vercel akses ke repo `ordersync-beauty`.
4. Di halaman konfigurasi:
   - **Project Name:** misalnya `ordersync-glowra`
   - **Root Directory:** klik **Edit** → pilih folder **`web`** ⚠️ (penting, karena website ada di subfolder)
   - **Framework Preset:** otomatis **Next.js**
5. Buka **Environment Variables**, lalu tambahkan:

   | Name | Value |
   |---|---|
   | `GOOGLE_SHEET_ID` | `1sNkN0lpWlXJpLtKMsMJF89Sv_--xajTc5DQ7GlzTgaI` |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | **isi lengkap** file `C:\Users\Kevin\Documents\kunci\glowra-n8n-….json`: buka dengan Notepad → `Ctrl+A` → `Ctrl+C` → tempel |
   | `NEXT_PUBLIC_SHEET_URL` | *(opsional)* link Google Sheet, kalau ingin pengunjung bisa membuka sheet-nya. Sheet tetap harus kamu bagikan sebagai "Siapa saja yang memiliki link → Pelihat" |

   **Jangan** isi `NEXT_PUBLIC_N8N_TERSAMBUNG`, supaya pemberitahuan mode online tampil.
6. Klik **Deploy**, lalu tunggu ±1-2 menit.
7. Buka link yang diberikan Vercel dan cek **/dashboard**. Angkanya harus sama dengan di laptop.

> 🔒 Kunci Google hanya tersimpan di Environment Variables Vercel (terenkripsi, hanya dibaca server). Website meminta izin **baca saja** ke Google Sheets. Jangan pernah menaruh kunci di file repo.

## Setelah online

- Setiap `git push` ke `main` otomatis memperbarui website.
- Kalau nanti n8n sudah online, tambahkan di Vercel: `N8N_WEBHOOK_URL`, `N8N_MARKETPLACE_WEBHOOK_URL`, `N8N_CEK_STOK_URL` (alamat n8n online), dan `NEXT_PUBLIC_N8N_TERSAMBUNG=ya`, lalu **Redeploy**.
  - Untuk simulator di Vercel: order simulasi disimpan di memori server, padahal Vercel bisa menjalankan beberapa server sekaligus. Saat n8n online, simpan order simulasi di penyimpanan bersama (misalnya Redis) supaya API tiruan selalu menemukan order-nya.

## Kalau ada masalah

| Gejala | Solusi |
|---|---|
| Build gagal *"Couldn't find any pages"* | Root Directory belum diset ke `web` → Settings → General → Root Directory |
| Dashboard: *Gagal login Google* | `GOOGLE_SERVICE_ACCOUNT_JSON` tidak tersalin utuh. Salin ulang seluruh isi file, termasuk `{` di awal dan `}` di akhir |
| Dashboard: *belum tersambung* | Salah satu variabel belum diisi. Setelah menambah variabel, lakukan **Redeploy** |
