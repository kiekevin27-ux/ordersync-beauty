"""
generate_dummy.py — Pembuat data dummy FIKTIF untuk toko "Glowra Beauty".

Menghasilkan:
  data/master_produk.csv        15 produk
  data/raw/shopee_orders.csv    200 pesanan (+ baris duplikat sengaja)
  data/raw/tiktok_orders.csv    100 pesanan (+ baris duplikat sengaja)
  data/raw/whatsapp_orders.csv   30 pesanan catatan manual admin (format berantakan)

Semua nama, nomor HP, dan nomor pesanan FIKTIF.
Nomor HP selalu berpola 08xx-555-xxxx ("555" = penanda nomor fiktif).

Jalankan dari folder project:
    python scripts/generate_dummy.py

Seed tetap 42, jadi hasilnya selalu sama persis setiap kali dijalankan.
"""

import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = 42
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"

# Rentang tanggal dikunci (bukan "hari ini") supaya hasil bisa diulang kapan saja.
TANGGAL_AWAL = date(2026, 8, 12)
TANGGAL_AKHIR = date(2026, 11, 11)

N_SHOPEE, N_TIKTOK, N_WA = 200, 100, 30
N_PELANGGAN_REPEAT = 55  # pelanggan yang belanja lebih dari sekali (~20% dari semua pembeli)

# Komposisi status per channel: selesai, dikirim, diproses, batal, retur
KOMPOSISI_STATUS = {
    "shopee": {"selesai": 140, "dikirim": 20, "diproses": 14, "batal": 16, "retur": 10},
    "tiktok": {"selesai": 70, "dikirim": 10, "diproses": 7, "batal": 8, "retur": 5},
    "whatsapp": {"selesai": 21, "dikirim": 3, "diproses": 2, "batal": 2, "retur": 2},
}

# ---------------------------------------------------------------------------
# MASTER PRODUK
# (sku, nama_produk, kategori, hpp, harga_jual, stok_awal, stok_minimum, bobot_laris)
# bobot_laris = seberapa sering produk dipesan (makin besar makin laris)
# ---------------------------------------------------------------------------
PRODUK = [
    ("GLW-SRM-001", "Glowra Niacinamide 10% Brightening Serum 20ml", "Serum", 42000, 119000, 60, 25, 14),
    ("GLW-SRM-002", "Glowra Vitamin C Glow Serum 20ml", "Serum", 48000, 135000, 70, 20, 9),
    ("GLW-SRM-003", "Glowra Retinol 0.3% Night Serum 20ml", "Serum", 55000, 149000, 35, 15, 4),
    ("GLW-TNR-001", "Glowra Centella Calming Toner 150ml", "Toner", 30000, 89000, 50, 20, 8),
    ("GLW-TNR-002", "Glowra AHA BHA Exfoliating Toner 100ml", "Toner", 33000, 95000, 40, 15, 5),
    ("GLW-SNS-001", "Glowra UV Shield Sunscreen SPF50 PA++++ 50ml", "Sunscreen", 35000, 99000, 65, 30, 15),
    ("GLW-SNS-002", "Glowra Tone Up Sunscreen SPF35 40ml", "Sunscreen", 32000, 89000, 50, 20, 7),
    ("GLW-MST-001", "Glowra Ceramide Barrier Moisturizer 50g", "Moisturizer", 38000, 109000, 60, 20, 8),
    ("GLW-MST-002", "Glowra Oil Control Gel Moisturizer 50g", "Moisturizer", 30000, 85000, 40, 20, 6),
    ("GLW-FWS-001", "Glowra Gentle Low pH Facial Wash 100ml", "Facial Wash", 15000, 49000, 85, 30, 12),
    ("GLW-FWS-002", "Glowra Acne Clear Facial Wash 100ml", "Facial Wash", 16000, 52000, 50, 25, 7),
    ("GLW-LTN-001", "Glowra Velvet Lip Tint - Rosy", "Lip Tint", 12000, 45000, 50, 25, 9),
    ("GLW-LTN-002", "Glowra Velvet Lip Tint - Coral", "Lip Tint", 12000, 45000, 50, 25, 6),
    ("GLW-MSK-001", "Glowra Hydrating Sheet Mask isi 5", "Masker", 20000, 59000, 70, 30, 7),
    ("GLW-SET-001", "Glowra Bright Skin Starter Kit", "Paket", 95000, 249000, 15, 8, 3),
]

# Cara admin WA menyebut produk di chat (sengaja tidak seragam, ada typo)
ALIAS_WA = {
    "GLW-SRM-001": ["serum niacinamide", "niacinamid serum", "serum bright 10%"],
    "GLW-SRM-002": ["serum vit c", "vitamin c serum", "vit c"],
    "GLW-SRM-003": ["retinol", "serum retinol malam"],
    "GLW-TNR-001": ["toner centella", "centella toner 150"],
    "GLW-TNR-002": ["toner aha bha", "exfo toner"],
    "GLW-SNS-001": ["sunscreen spf50", "sunscren spf50", "ss 50 uv shield"],
    "GLW-SNS-002": ["sunscreen tone up", "tone up spf35"],
    "GLW-MST-001": ["moist ceramide", "ceramide moisturizer"],
    "GLW-MST-002": ["gel moisturizer", "moist oil control"],
    "GLW-FWS-001": ["facial wash gentle", "sabun muka low ph"],
    "GLW-FWS-002": ["facial wash acne", "sabun muka acne"],
    "GLW-LTN-001": ["liptint rosy", "lip tint rosy"],
    "GLW-LTN-002": ["liptint coral", "lip tint coral"],
    "GLW-MSK-001": ["sheet mask", "masker 5pcs"],
    "GLW-SET-001": ["starter kit", "paket bright skin"],
}

# ---------------------------------------------------------------------------
# NAMA FIKTIF (kombinasi acak nama depan + belakang)
# ---------------------------------------------------------------------------
NAMA_DEPAN = [
    "Dewi", "Ayu", "Putri", "Sari", "Rina", "Intan", "Nadia", "Fitri", "Wulan", "Citra",
    "Anisa", "Bella", "Clara", "Dinda", "Elsa", "Farah", "Gita", "Hana", "Indah", "Jihan",
    "Kirana", "Laras", "Maya", "Nabila", "Olivia", "Putu", "Rahma", "Salsa", "Tiara", "Vina",
    "Yuni", "Zahra", "Amel", "Bunga", "Dian", "Eka", "Fany", "Gina", "Icha", "Kezia",
    "Lia", "Mega", "Nia", "Ratna", "Sinta", "Tasya", "Winda", "Yola", "Rizky", "Bagas",
    "Dimas", "Fajar", "Galih", "Hendra", "Kevin", "Raka", "Yoga", "Arif", "Bima", "Reza",
]
NAMA_BELAKANG = [
    "Lestari", "Pratiwi", "Wulandari", "Rahmawati", "Saputri", "Anggraini", "Kusuma", "Permata",
    "Puspita", "Maharani", "Safitri", "Handayani", "Utami", "Novitasari", "Hidayat", "Santoso",
    "Wijaya", "Setiawan", "Nugroho", "Siregar", "Nasution", "Simanjuntak", "Harahap", "Sitompul",
    "Purnama", "Ramadhani", "Febriani", "Oktaviani", "Kurniawan", "Gunawan", "Halim", "Tanjung",
    "Pertiwi", "Melati", "Rosalina", "Amalia", "Azzahra", "Fauziah", "Damayanti", "Yulianti",
]
KODE_OPERATOR = ["812", "813", "821", "822", "852", "857", "877", "878", "895", "896"]

BULAN_ID = {8: "Agu", 9: "Sep", 10: "Okt", 11: "Nov"}

LABEL_STATUS_SHOPEE = {
    "selesai": "Selesai", "dikirim": "Sedang Dikirim", "diproses": "Perlu Dikirim",
    "batal": "Batal", "retur": "Pengembalian Barang/Dana",
}
LABEL_STATUS_TIKTOK = {
    "selesai": "Completed", "dikirim": "Shipped", "diproses": "Awaiting Shipment",
    "batal": "Cancelled", "retur": "Returned",
}
LABEL_STATUS_WA = {
    "selesai": ["selesai", "Done", "sdh sampai", "udah diterima", "SELESAI"],
    "dikirim": ["dikirim", "otw", "udh dikirim"],
    "diproses": ["blm dikirim", "proses", "nunggu packing"],
    "batal": ["batal", "cancel", "gajadi"],
    "retur": ["retur", "retur - rusak", "retur - salah warna"],
}

# Bobot jam pemesanan (0-23): ramai malam hari
BOBOT_JAM = [2, 1, 0.5, 0.3, 0.3, 0.5, 1, 2, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 4, 6, 8, 9, 8, 5]


def rupiah(n):
    """119000 -> '119.000'"""
    return f"{n:,}".replace(",", ".")


def bobot_hari(d):
    """Seberapa ramai suatu tanggal."""
    if d.day == d.month:                       # tanggal kembar: 9.9, 10.10, 11.11
        return 6.0
    if abs(d.day - d.month) == 1 and d.day <= 12:  # sehari sebelum/sesudah tanggal kembar
        return 1.6
    if d.day >= 25:                            # gajian: 25 s.d. akhir bulan
        return 2.2
    if d.day <= 2:                             # awal bulan, sisa euforia gajian
        return 1.5
    return 1.0


def buat_pelanggan(rng, jumlah):
    pelanggan, nama_terpakai, hp_terpakai = [], set(), set()
    while len(pelanggan) < jumlah:
        depan, belakang = rng.choice(NAMA_DEPAN), rng.choice(NAMA_BELAKANG)
        nama = f"{depan} {belakang}"
        if nama in nama_terpakai:
            continue
        hp = f"{rng.choice(KODE_OPERATOR)}555{rng.randint(0, 9999):04d}"  # contoh: 8125551234
        if hp in hp_terpakai:
            continue
        nama_terpakai.add(nama)
        hp_terpakai.add(hp)
        sep = rng.choice(["", ".", "_"])
        pelanggan.append({
            "nama": nama,
            "hp": hp,  # tanpa 0 / 62 di depan
            "user_shopee": f"{depan.lower()}{sep}{belakang.lower()}{rng.choice(['', str(rng.randint(1, 99))])}",
            "user_tiktok": f"{depan.lower()}{rng.choice(['', '_', '.'])}{belakang.lower()[:4]}{rng.randint(10, 999)}",
        })
    return pelanggan


def format_hp(rng, hp, channel):
    """Tulis nomor HP dengan format yang sengaja tidak seragam."""
    a, b, c = hp[:3], hp[3:6], hp[6:]
    pilihan = {
        "shopee": ([f"62{hp}", f"0{hp}", f"+62 {a}-{b}-{c}"], [60, 30, 10]),
        "tiktok": ([f"(+62){hp}", f"+62{hp}", f"0{hp}"], [55, 25, 20]),
        "whatsapp": ([f"0{a}-{b}-{c}", f"0{a} {b} {c}", f"+62 {a}-{b}-{c}", f"0{hp}", f"62{hp}"],
                     [30, 25, 20, 15, 10]),
    }
    formats, bobot = pilihan[channel]
    return rng.choices(formats, bobot)[0]


def buat_waktu(rng, hari, bobot):
    d = rng.choices(hari, bobot)[0]
    bobot_jam = list(BOBOT_JAM)
    if d.day == d.month:          # flash sale tengah malam di tanggal kembar
        bobot_jam[0] = 10
        bobot_jam[12] = 7
    jam = rng.choices(range(24), bobot_jam)[0]
    return datetime(d.year, d.month, d.day, jam, rng.randint(0, 59), rng.randint(0, 59))


def tetapkan_status(rng, pesanan, komposisi):
    """Pesanan paling baru = belum selesai (diproses/dikirim). Sisanya acak."""
    pesanan.sort(key=lambda o: o["waktu"])
    n = len(pesanan)
    k_pro, k_kir = komposisi["diproses"], komposisi["dikirim"]
    for o in pesanan[n - k_pro:]:
        o["status"] = "diproses"
    for o in pesanan[n - k_pro - k_kir:n - k_pro]:
        o["status"] = "dikirim"
    sisa = (["selesai"] * komposisi["selesai"] + ["batal"] * komposisi["batal"]
            + ["retur"] * komposisi["retur"])
    assert len(sisa) == n - k_pro - k_kir, "komposisi status tidak cocok dengan jumlah pesanan"
    rng.shuffle(sisa)
    for o, s in zip(pesanan[:n - k_pro - k_kir], sisa):
        o["status"] = s


def no_pesanan_shopee(rng, waktu, terpakai):
    karakter = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        # Pola mirip asli (YYMMDD + kode), "DM" = DuMmy penanda fiktif
        kode = waktu.strftime("%y%m%d") + "DM" + "".join(rng.choice(karakter) for _ in range(6))
        if kode not in terpakai:
            terpakai.add(kode)
            return kode


def no_pesanan_tiktok(rng, terpakai):
    while True:
        # 18 digit seperti aslinya, diawali "9900" sebagai penanda fiktif
        kode = "9900" + "".join(str(rng.randint(0, 9)) for _ in range(14))
        if kode not in terpakai:
            terpakai.add(kode)
            return kode


def tulis_csv(path, header, baris):
    path.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig = UTF-8 with BOM, supaya Excel membaca huruf & simbol dengan benar
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(baris)


def main():
    rng = random.Random(SEED)
    produk_by_sku = {p[0]: p for p in PRODUK}
    daftar_sku = [p[0] for p in PRODUK]
    bobot_sku = [p[7] for p in PRODUK]

    # ---------- 1. Master produk ----------
    tulis_csv(
        DATA_DIR / "master_produk.csv",
        ["sku", "nama_produk", "kategori", "hpp", "harga_jual", "stok_awal", "stok_minimum"],
        [p[:7] for p in PRODUK],
    )

    # ---------- 2. Pelanggan & pembagian order ----------
    total_order = N_SHOPEE + N_TIKTOK + N_WA
    jumlah_order_repeat = [rng.choices([2, 3, 4], [60, 30, 10])[0] for _ in range(N_PELANGGAN_REPEAT)]
    n_sekali = total_order - sum(jumlah_order_repeat)
    pelanggan = buat_pelanggan(rng, N_PELANGGAN_REPEAT + n_sekali)

    slot = []
    for i, k in enumerate(jumlah_order_repeat):
        slot += [i] * k
    slot += list(range(N_PELANGGAN_REPEAT, N_PELANGGAN_REPEAT + n_sekali))
    rng.shuffle(slot)
    slot_per_channel = {
        "shopee": slot[:N_SHOPEE],
        "tiktok": slot[N_SHOPEE:N_SHOPEE + N_TIKTOK],
        "whatsapp": slot[N_SHOPEE + N_TIKTOK:],
    }

    hari = [TANGGAL_AWAL + timedelta(days=i) for i in range((TANGGAL_AKHIR - TANGGAL_AWAL).days + 1)]
    bobot = [bobot_hari(d) for d in hari]

    def buat_pesanan(channel):
        hasil = []
        for idx in slot_per_channel[channel]:
            hasil.append({
                "pelanggan": pelanggan[idx],
                "waktu": buat_waktu(rng, hari, bobot),
                "sku": rng.choices(daftar_sku, bobot_sku)[0],
                "qty": rng.choices([1, 2, 3], [70, 22, 8])[0],
            })
        tetapkan_status(rng, hasil, KOMPOSISI_STATUS[channel])
        return hasil

    catatan_kotor = []

    # ---------- 3. Shopee ----------
    shopee = buat_pesanan("shopee")
    terpakai = set()
    baris_shopee = []
    for o in sorted(shopee, key=lambda o: o["waktu"], reverse=True):  # export Shopee: terbaru di atas
        p = produk_by_sku[o["sku"]]
        ongkir = rng.choices([0, 8000, 10000, 12000, 15000, 18000, 22000], [25, 10, 15, 20, 15, 10, 5])[0]
        baris_shopee.append([
            no_pesanan_shopee(rng, o["waktu"], terpakai),
            LABEL_STATUS_SHOPEE[o["status"]],
            o["waktu"].strftime("%Y-%m-%d %H:%M"),
            o["sku"], p[1], o["qty"], p[4], ongkir,
            o["pelanggan"]["user_shopee"], o["pelanggan"]["nama"],
            format_hp(rng, o["pelanggan"]["hp"], "shopee"),
        ])

    # ---------- 4. TikTok ----------
    tiktok = buat_pesanan("tiktok")
    terpakai = set()
    baris_tiktok = []
    for o in sorted(tiktok, key=lambda o: o["waktu"]):
        p = produk_by_sku[o["sku"]]
        ongkir = rng.choices([0, 9000, 12000, 15000, 19000], [35, 15, 25, 15, 10])[0]
        nama = o["pelanggan"]["nama"]
        if rng.random() < 0.12:
            nama = nama.upper()  # data kotor: huruf kapital semua
        baris_tiktok.append([
            no_pesanan_tiktok(rng, terpakai),
            LABEL_STATUS_TIKTOK[o["status"]],
            o["waktu"].strftime("%d/%m/%Y %H:%M:%S"),
            o["sku"], p[1], o["qty"], p[4], ongkir,
            o["pelanggan"]["user_tiktok"], nama,
            format_hp(rng, o["pelanggan"]["hp"], "tiktok"),
        ])

    # ---------- 5. Sisipkan data kotor (Shopee & TikTok) ----------
    # Kolom: 0=no pesanan, 3=SKU, 4=nama produk
    def pilih_baris(baris, syarat, jumlah, hindari):
        kandidat = [i for i, b in enumerate(baris) if syarat(b) and i not in hindari]
        dipilih = rng.sample(kandidat, jumlah)
        hindari.update(dipilih)
        return dipilih

    def sisipkan_spasi(nama):
        kata = nama.split(" ")
        i = rng.randint(1, len(kata) - 1)
        kata[i] = " " + kata[i]          # dobel spasi di tengah
        return " ".join(kata) + rng.choice(["  ", " ", ""])  # kadang spasi di belakang

    for nama_ch, baris, sku_asli, sku_typo, n_typo, n_spasi in [
        ("Shopee", baris_shopee, "GLW-SRM-001", "GLW-SRM-01", 2, 4),
        ("TikTok", baris_tiktok, "GLW-SNS-001", "GLW-SNS001", 1, 2),
    ]:
        dipakai = set()
        for i in pilih_baris(baris, lambda b: b[3] == sku_asli, n_typo, dipakai):
            baris[i][3] = sku_typo
            catatan_kotor.append((nama_ch, "SKU typo", baris[i][0], f"{sku_asli} ditulis '{sku_typo}'"))
        for i in pilih_baris(baris, lambda b: True, n_spasi, dipakai):
            baris[i][4] = sisipkan_spasi(baris[i][4])
            catatan_kotor.append((nama_ch, "Spasi berlebih", baris[i][0], repr(baris[i][4])))

    # Duplikat: baris disalin persis & diselipkan tak jauh dari aslinya
    for nama_ch, baris, n_dup in [("Shopee", baris_shopee, 2), ("TikTok", baris_tiktok, 1)]:
        asli = rng.sample(range(len(baris)), n_dup)
        for i in sorted(asli, reverse=True):
            salinan = list(baris[i])
            baris.insert(min(i + rng.randint(1, 4), len(baris)), salinan)
            catatan_kotor.append((nama_ch, "Baris duplikat", salinan[0], "baris disalin 2x"))

    tulis_csv(
        RAW_DIR / "shopee_orders.csv",
        ["No. Pesanan", "Status Pesanan", "Waktu Pesanan Dibuat", "SKU Induk", "Nama Produk", "Jumlah",
         "Harga Awal", "Ongkos Kirim Dibayar oleh Pembeli", "Username (Pembeli)", "Nama Penerima",
         "No. Telepon"],
        baris_shopee,
    )
    tulis_csv(
        RAW_DIR / "tiktok_orders.csv",
        ["Order ID", "Order Status", "Created Time", "Seller SKU", "Product Name", "Quantity",
         "SKU Unit Original Price", "Shipping Fee", "Buyer Username", "Recipient", "Phone #"],
        baris_tiktok,
    )

    # ---------- 6. WhatsApp (catatan manual admin) ----------
    wa = sorted(buat_pesanan("whatsapp"), key=lambda o: o["waktu"])
    baris_wa = []
    for no, o in enumerate(wa, start=1):
        p = produk_by_sku[o["sku"]]
        d, q = o["waktu"].date(), o["qty"]
        total = p[4] * q
        ongkir = rng.choices([0, 9000, 12000, 15000, 18000], [15, 25, 30, 20, 10])[0]
        nama = o["pelanggan"]["nama"]
        r = rng.random()
        if r < 0.3:
            nama = "kak " + nama.split()[0].lower() + " " + nama.split()[1].lower()
        elif r < 0.45:
            nama = nama.lower()
        baris_wa.append([
            no,
            rng.choice([f"{d.day}/{d.month}/{d.year}", f"{d.day:02d}-{d.month:02d}-{d.year % 100:02d}",
                        f"{d.day} {BULAN_ID[d.month]} {d.year}"]),
            nama,
            format_hp(rng, o["pelanggan"]["hp"], "whatsapp"),
            rng.choice(ALIAS_WA[o["sku"]]),
            rng.choice([f"{q}", f"{q} pcs", f"{q}pc", f"x{q}"]),
            rng.choice([f"Rp{rupiah(total)}", f"{total // 1000}rb", f"{total}", f"Rp {rupiah(total)},-"]),
            rng.choice(["free", "0", "-", "gratis"]) if ongkir == 0
            else rng.choice([f"{ongkir // 1000}rb", f"Rp{rupiah(ongkir)}", str(ongkir)]),
            rng.choice(["blm tf", "-"]) if o["status"] == "batal" else rng.choice(["lunas", "LUNAS", "udh tf", "lunas (BCA)"]),
            rng.choice(LABEL_STATUS_WA[o["status"]]),
            rng.choices(["", "minta bubble wrap tebal", "kirim sore aja", "repeat order", "minta free sample"],
                        [60, 10, 10, 10, 10])[0],
        ])
    tulis_csv(
        RAW_DIR / "whatsapp_orders.csv",
        ["No", "Tgl", "Nama", "No WA", "Pesanan", "Jml", "Total", "Ongkir", "Bayar", "Status", "Catatan"],
        baris_wa,
    )

    # ---------- 7. Laporan ----------
    print("Data dummy Glowra Beauty berhasil dibuat (seed 42)")
    print(f"  master_produk.csv   : {len(PRODUK)} produk")
    print(f"  shopee_orders.csv   : {len(baris_shopee)} baris ({N_SHOPEE} pesanan unik + duplikat)")
    print(f"  tiktok_orders.csv   : {len(baris_tiktok)} baris ({N_TIKTOK} pesanan unik + duplikat)")
    print(f"  whatsapp_orders.csv : {len(baris_wa)} baris")
    print(f"  pelanggan unik      : {len(pelanggan)} (repeat: {N_PELANGGAN_REPEAT})")
    print("\nData kotor yang sengaja disisipkan:")
    for ch, jenis, no, ket in catatan_kotor:
        print(f"  [{ch}] {jenis:15} {no}  -> {ket}")


if __name__ == "__main__":
    main()
