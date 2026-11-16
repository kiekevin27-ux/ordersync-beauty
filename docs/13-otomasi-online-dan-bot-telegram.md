# 13 · Otomasi Online (Vercel) & Bot Telegram

Sekarang versi online **benar-benar bekerja** tanpa laptop. Checkout dan simulator mencatat order ke Google Sheet, stok dipantau, dan bot Telegram **@AMBAPRIMEBOT** bisa diajak chat.

> Analogi: n8n itu dapur besar di rumah (laptop). Supaya restoran tetap buka saat rumah dikunci, resep yang sama kita salin ke dapur kecil di mal (Vercel). Rasanya sama, karena resepnya disalin baris per baris.

Latar belakang keputusan: [ADR-003](adr/ADR-003-mesin-otomasi-di-vercel.md).

## Apa yang jalan di mana

| Alur | Laptop (n8n) | Online (Vercel) |
|---|---|---|
| Checkout toko → Sheets (wf 03) | ✅ | ✅ `lib/gerbang.ts` |
| Simulator Shopee/TikTok (wf 04) | ✅ | ✅ `lib/marketplace.ts` |
| Pemantau stok → Telegram (wf 06) | ✅ tiap 5 menit | ✅ setiap ada order + ringkasan **tiap pagi 08:00 WIB** |
| Bot Telegram bisa diajak chat | ❌ | ✅ `lib/bot.ts` |
| Import file export Drive (wf 05) | ✅ | ❌ (belum dipindah) |

Website memilih mesinnya sendiri: kalau alamat `N8N_*_URL` diisi, n8n yang dipakai. Kalau kosong, mesin Vercel yang bekerja.

## Perintah bot

Kirim ke **@AMBAPRIMEBOT**:

| Perintah | Isi jawaban |
|---|---|
| `/ringkasan` | Omzet, jumlah order, rata-rata, per channel, produk terlaris |
| `/hariini` | Order yang masuk hari ini |
| `/terbaru` | 5 order terakhir |
| `/order WEB-2026…` | Detail 1 order |
| `/stok` | Stok semua produk |
| `/restock` | Produk yang perlu restock |
| `/bantuan` | Daftar perintah |
| `/id` | Chat id kamu (siapa pun boleh) |

Hanya chat id di `TELEGRAM_CHAT_ID` yang bisa melihat data toko. Orang lain hanya diberi tahu bahwa bot ini privat.

## Menguji bot: halaman Uji Stok

Buka **`/uji-stok`** (link *Uji Bot* di menu atas, atau dari Dashboard):

- **⚠️ Bikin menipis**: membuat 1 order uji supaya sisa stok tepat 1 di bawah minimum (status RESTOCK)
- **⛔ Habiskan**: membuat 1 order uji supaya sisa stok 0 (status HABIS)
- **↺ Reset**: menghapus semua order uji (no pesanan berawalan `UJI-`), stok kembali seperti semula, dan bot melapor "sudah aman lagi"

Order uji lewat gerbang order yang sama dengan checkout, jadi yang diuji adalah alur sungguhan. Order asli tidak pernah disentuh oleh Reset.

## Pengaturan di Vercel (Environment Variables)

Selain `GOOGLE_SHEET_ID` & `GOOGLE_SERVICE_ACCOUNT_JSON` yang sudah ada:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_MESIN_OTOMASI` | `vercel` |
| `TELEGRAM_BOT_TOKEN` | isi file `C:\Users\Kevin\Documents\kunci\telegram-bot.txt` |
| `TELEGRAM_CHAT_ID` | chat id pemilik toko (kirim `/id` ke bot untuk melihatnya) |
| `TELEGRAM_WEBHOOK_SECRET` | baris `TELEGRAM_WEBHOOK_SECRET=` di `C:\Users\Kevin\Documents\kunci\ordersync-rahasia.txt` (bagian setelah `=`) |
| `CRON_SECRET` | baris `CRON_SECRET=` di file yang sama (bagian setelah `=`) |

Setelah env diisi, **Redeploy** (karena `NEXT_PUBLIC_…` dibaca saat build).

## Memasang webhook Telegram (sekali saja)

Supaya Telegram meneruskan chat ke website, jalankan dari folder project (PowerShell):

```powershell
$token  = (Get-Content C:\Users\Kevin\Documents\kunci\telegram-bot.txt).Trim()
$secret = ((Get-Content C:\Users\Kevin\Documents\kunci\ordersync-rahasia.txt | Select-String TELEGRAM_WEBHOOK_SECRET) -split '=',2)[1]
Invoke-RestMethod "https://api.telegram.org/bot$token/setWebhook" -Method Post -Body @{ url = "https://web-inky-five-78.vercel.app/api/telegram"; secret_token = $secret; allowed_updates = '["message"]' }
```

Cek status: buka `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`, lalu pastikan `url` terisi dan `last_error_message` kosong.

## Mencoba mode Vercel di laptop

Buat file `web/.env.development.local` (diabaikan git) yang mengosongkan `N8N_*_URL` dan mengisi variabel Telegram di atas, lalu jalankan `npm run dev` dengan `NODE_OPTIONS=--dns-result-order=ipv4first` (jaringan rumah bermasalah dengan IPv6 ke Telegram). Hapus file itu untuk kembali ke mode n8n.

## Kalau ada yang tidak jalan

| Gejala | Penyebab umum |
|---|---|
| Checkout masih "belum tersambung" | `NEXT_PUBLIC_MESIN_OTOMASI` belum diisi, atau belum Redeploy |
| Checkout "gagal simpan" | Robot belum jadi **Editor** di sheet, atau `GOOGLE_SERVICE_ACCOUNT_JSON` terpotong |
| Bot diam saja | Webhook belum dipasang, atau `TELEGRAM_WEBHOOK_SECRET` di Vercel beda dengan saat `setWebhook` |
| Bot menjawab "data hanya untuk pemilik" | `TELEGRAM_CHAT_ID` salah. Kirim `/id` ke bot untuk melihat chat id yang benar |
| Peringatan stok terkirim berulang | Tab `Memori_Bot` terhapus/diubah. Biarkan saja, nanti dibuat ulang otomatis |
