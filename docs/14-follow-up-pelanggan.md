# 14 · Follow-up pelanggan: minta ulasan & pengingat beli ulang

Skincare itu **habis pakai**. Pembeli yang puas dan diingatkan tepat waktu cenderung beli lagi, tapi admin toko jarang sempat mengingat siapa harus dihubungi kapan. Fitur ini mengerjakan bagian "mengingat"-nya.

## Alur

```
Checkout (centang "boleh dihubungi via WhatsApp")
   → order diantar → status "sampai" (dashboard) → kolom sampai_pada terisi
   → setiap pagi 08:00 WIB (Vercel Cron) hitung siapa yang jatuh tempo
   → bot Telegram kirim 1 kartu per pelanggan:
        📱 WhatsApp (HP) / 💻 WhatsApp Web   ✅ Sudah dikirim   ⏭️ Lewati   🚫 Jangan hubungi lagi
   → pelanggan klik link "pesan ulang" → keranjang terisi → checkout
   → follow-up dicatat BERHASIL + omzetnya muncul di dashboard
```

## Aturan jadwal

| Jenis | Kapan | Isi |
|---|---|---|
| ⭐ Minta ulasan | H+3 setelah sampai | Tanya kecocokan produk, minta ulasan |
| 🔁 Beli ulang | (lama pakai × qty) − 5 hari setelah sampai, minimal H+7 | Pengingat + link pesan ulang |

- Lama pakai per produk dibaca dari tab **`Lama_Pakai`** (dibuat otomatis dari perkiraan awal di kolom `lama_pakai_hari` pada [`data/master_produk.csv`](../data/master_produk.csv): serum 20 ml ±30 hari, toner 150 ml ±60 hari, dst.). Pemilik toko boleh mengubah angkanya langsung di Sheet.
- Order berisi beberapa produk: yang paling cepat habis yang dipakai.
- Pengingat beli ulang dilewati kalau pembeli sudah membeli produk yang sama lagi.
- Yang jatuh tempo sampai 14 hari lalu tetap muncul (misal admin libur); lebih lama dari itu dianggap kedaluwarsa.

## Pengaman: anggap sampai otomatis

Follow-up hanya berjalan kalau order ditandai **Sampai**. Kalau admin lupa, order website/WA yang statusnya **Diantar lebih dari 4 hari** ditandai sampai oleh sistem (kolom `sampai_otomatis = ya`, tanggal kirim di `dikirim_pada`) setiap pagi dan setiap `/followup`, lalu pemilik toko dikabari di Telegram. Maksimal 20 order per putaran. Kode: [`web/lib/sampaiOtomatis.ts`](../web/lib/sampaiOtomatis.ts).

## Siklus pakai produk (data nyata)

Perkiraan awal lama pakai dikoreksi oleh **jarak pembelian ulang** pelanggan sendiri: pelanggan yang sama membeli produk yang sama lagi → (tanggal beli berikutnya − sebelumnya) ÷ qty sebelumnya. Diambil **median**; jarak < 3 atau > 180 hari diabaikan. Dashboard (kartu **Siklus pakai produk**) menampilkan angka yang dipakai vs data nyata, dan menyarankan perubahan kalau sudah ada **minimal 5 data** dan bedanya ≥ 15%. Tombol **Terapkan** menulis angka baru ke tab `Lama_Pakai`, sehingga jadwal pengingat langsung menyesuaikan. Pembeli marketplace dengan no HP disamarkan tidak bisa dilacak. Kode: [`web/lib/siklus.ts`](../web/lib/siklus.ts).

## Siapa yang TIDAK dihubungi

- Pembeli yang tidak mencentang izin WhatsApp (UU Pelindungan Data Pribadi).
- Nomor di tab `Tidak_Dihubungi` (tombol 🚫 di Telegram).
- **Pembeli Shopee/TikTok**: nomornya disamarkan marketplace dan aturan platform melarang menarik pembeli keluar platform. Pakai fitur chat/voucher bawaan marketplace.

## Tab Google Sheet (dibuat otomatis)

| Tab | Isi |
|---|---|
| `Follow_Up` | Riwayat: id (`no_pesanan\|u` ulasan / `\|b` beli ulang), status `terkirim` / `dilewati` / `berhasil`, pesanan ulang & omzetnya |
| `Template_Pesan` | Teks WhatsApp yang bisa diedit pemilik toko. Penanda: `{nama}`, `{produk}`, `{hari}`, `{link}`, `{no_pesanan}`. Boleh pakai emoji. Kartu punya 2 tombol: **📱 WhatsApp (HP)** (`wa.me`) dan **💻 WhatsApp Web (laptop)** (`web.whatsapp.com/send`), karena aplikasi WhatsApp Desktop di Windows bisa mengubah emoji dari link `wa.me` jadi "?" |
| `Tidak_Dihubungi` | Nomor yang minta berhenti dihubungi |
| `Lama_Pakai` | Lama pakai per produk (hari) yang dipakai jadwal beli ulang |

Kolom baru di `Order_Masuk`: `izin_wa`, `sampai_pada`, `dikirim_pada`, `sampai_otomatis`, `dari_followup`.

## Kenapa pesan tidak dikirim otomatis?

Mengirim WhatsApp otomatis butuh **WhatsApp Business Platform** resmi (verifikasi bisnis Meta, template pesan disetujui, biaya per percakapan). Untuk UMKM, versi "admin tinggal tekan kirim" sudah menghemat sebagian besar pekerjaan, gratis, dan tanpa risiko nomor diblokir. Versi otomatis penuh bisa jadi upgrade.

## Mencoba tanpa menunggu 3 / 30 hari

Halaman **`/uji-followup`**: buat pelanggan contoh yang paketnya "sampai 3 hari lalu", "membeli serum ±4 minggu lalu", atau "diantar 5 hari lalu tapi lupa ditandai sampai", buat **riwayat beli ulang** fiktif untuk kartu siklus pakai, lihat daftar & pesan WA-nya, kirim ke Telegram, lalu **Reset** untuk menghapus semua data uji (order `UJI-FU-…`, catatan follow-up, pesanan ulang dari order uji, nomor uji di `Tidak_Dihubungi`, dan tab `Lama_Pakai` kembali ke perkiraan awal).

Perintah bot: `/followup` menampilkan daftar hari ini kapan saja.

## File

- [`web/lib/followup.ts`](../web/lib/followup.ts) — aturan jadwal, template, pencatatan, statistik
- [`web/lib/followupBot.ts`](../web/lib/followupBot.ts) — kartu Telegram & tombolnya
- [`web/app/pesan-ulang/[no]`](../web/app/pesan-ulang) — link pesan ulang (hanya SKU & qty yang dikirim ke browser)
- [`web/lib/ujiFollowup.ts`](../web/lib/ujiFollowup.ts) · [`web/app/uji-followup`](../web/app/uji-followup) — mode uji

Catatan: kolom & aturan ini hanya ada di mesin versi Vercel (`web/lib/gerbang.ts`). Workflow n8n lama tidak mengenal `izin_wa` / `sampai_pada`.
