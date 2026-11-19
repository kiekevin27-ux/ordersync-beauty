# 14 · Follow-up pelanggan: minta ulasan & pengingat beli ulang

Skincare itu **habis pakai**. Pembeli yang puas dan diingatkan tepat waktu cenderung beli lagi, tapi admin toko jarang sempat mengingat siapa harus dihubungi kapan. Fitur ini mengerjakan bagian "mengingat"-nya.

## Alur

```
Checkout (centang "boleh dihubungi via WhatsApp")
   → order diantar → status "sampai" (dashboard) → kolom sampai_pada terisi
   → setiap pagi 08:00 WIB (Vercel Cron) hitung siapa yang jatuh tempo
   → bot Telegram kirim 1 kartu per pelanggan:
        💬 Buka WhatsApp (pesan sudah terisi)   ✅ Sudah dikirim   ⏭️ Lewati   🚫 Jangan hubungi lagi
   → pelanggan klik link "pesan ulang" → keranjang terisi → checkout
   → follow-up dicatat BERHASIL + omzetnya muncul di dashboard
```

## Aturan jadwal

| Jenis | Kapan | Isi |
|---|---|---|
| ⭐ Minta ulasan | H+3 setelah sampai | Tanya kecocokan produk, minta ulasan |
| 🔁 Beli ulang | (lama pakai × qty) − 5 hari setelah sampai, minimal H+7 | Pengingat + link pesan ulang |

- Lama pakai per produk ada di kolom `lama_pakai_hari` pada [`data/master_produk.csv`](../data/master_produk.csv) (serum 20 ml ±30 hari, toner 150 ml ±60 hari, dst.).
- Order berisi beberapa produk: yang paling cepat habis yang dipakai.
- Pengingat beli ulang dilewati kalau pembeli sudah membeli produk yang sama lagi.
- Yang jatuh tempo sampai 14 hari lalu tetap muncul (misal admin libur); lebih lama dari itu dianggap kedaluwarsa.

## Siapa yang TIDAK dihubungi

- Pembeli yang tidak mencentang izin WhatsApp (UU Pelindungan Data Pribadi).
- Nomor di tab `Tidak_Dihubungi` (tombol 🚫 di Telegram).
- **Pembeli Shopee/TikTok**: nomornya disamarkan marketplace dan aturan platform melarang menarik pembeli keluar platform. Pakai fitur chat/voucher bawaan marketplace.

## Tab Google Sheet (dibuat otomatis)

| Tab | Isi |
|---|---|
| `Follow_Up` | Riwayat: id (`no_pesanan\|u` ulasan / `\|b` beli ulang), status `terkirim` / `dilewati` / `berhasil`, pesanan ulang & omzetnya |
| `Template_Pesan` | Teks WhatsApp yang bisa diedit pemilik toko. Penanda: `{nama}`, `{produk}`, `{hari}`, `{link}`, `{no_pesanan}` |
| `Tidak_Dihubungi` | Nomor yang minta berhenti dihubungi |

Kolom baru di `Order_Masuk`: `izin_wa`, `sampai_pada`, `dari_followup`.

## Kenapa pesan tidak dikirim otomatis?

Mengirim WhatsApp otomatis butuh **WhatsApp Business Platform** resmi (verifikasi bisnis Meta, template pesan disetujui, biaya per percakapan). Untuk UMKM, versi "admin tinggal tekan kirim" sudah menghemat sebagian besar pekerjaan, gratis, dan tanpa risiko nomor diblokir. Versi otomatis penuh bisa jadi upgrade.

## Mencoba tanpa menunggu 3 / 30 hari

Halaman **`/uji-followup`**: buat pelanggan contoh yang paketnya "sampai 3 hari lalu" atau "membeli serum ±4 minggu lalu", lihat daftar & pesan WA-nya, kirim ke Telegram, lalu **Reset** untuk menghapus semua data uji (order `UJI-FU-…`, catatan follow-up, pesanan ulang dari order uji, nomor uji di `Tidak_Dihubungi`).

Perintah bot: `/followup` menampilkan daftar hari ini kapan saja.

## File

- [`web/lib/followup.ts`](../web/lib/followup.ts) — aturan jadwal, template, pencatatan, statistik
- [`web/lib/followupBot.ts`](../web/lib/followupBot.ts) — kartu Telegram & tombolnya
- [`web/app/pesan-ulang/[no]`](../web/app/pesan-ulang) — link pesan ulang (hanya SKU & qty yang dikirim ke browser)
- [`web/lib/ujiFollowup.ts`](../web/lib/ujiFollowup.ts) · [`web/app/uji-followup`](../web/app/uji-followup) — mode uji

Catatan: kolom & aturan ini hanya ada di mesin versi Vercel (`web/lib/gerbang.ts`). Workflow n8n lama tidak mengenal `izin_wa` / `sampai_pada`.
