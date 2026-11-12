"""
clean_merge.py — Membersihkan & menggabungkan order Shopee, TikTok Shop, dan WhatsApp
menjadi satu tabel seragam: data/clean/orders_gabungan.csv

Yang dibereskan:
  - baris duplikat (no_pesanan + sku sama)       -> dibuang
  - SKU typo (GLW-SRM-01, GLW-SNS001, huruf kecil) -> diperbaiki ke format GLW-XXX-000
  - spasi berlebih di nama produk                -> nama diambil dari Master Produk
  - nomor HP beda format                         -> diseragamkan jadi 628xxxxxxxxx
  - nama pembeli (KAPITAL / huruf kecil / "kak") -> dirapikan jadi Huruf Awal Kapital
  - status beda istilah per channel              -> selesai / dikirim / diproses / batal / retur
  - catatan WA (tanggal, produk, qty, harga teks) -> diubah jadi data terstruktur

Jalankan dari folder project:
    python scripts/clean_merge.py
"""

import csv
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_PATH = ROOT / "data" / "clean" / "orders_gabungan.csv"

KOLOM_OUTPUT = ["channel", "no_pesanan", "tanggal", "sku", "nama_produk", "qty", "harga_satuan",
                "ongkir", "nama_pembeli", "no_hp_normal", "status_normal"]

STATUS_SHOPEE = {
    "Selesai": "selesai", "Sedang Dikirim": "dikirim", "Perlu Dikirim": "diproses",
    "Batal": "batal", "Pengembalian Barang/Dana": "retur",
}
STATUS_TIKTOK = {
    "Completed": "selesai", "Shipped": "dikirim", "Awaiting Shipment": "diproses",
    "Cancelled": "batal", "Returned": "retur",
}
STATUS_WA = {
    "selesai": "selesai", "done": "selesai", "sdh sampai": "selesai", "udah diterima": "selesai",
    "dikirim": "dikirim", "otw": "dikirim", "udh dikirim": "dikirim",
    "blm dikirim": "diproses", "proses": "diproses", "nunggu packing": "diproses",
    "batal": "batal", "cancel": "batal", "gajadi": "batal",
}

# Kata kunci di catatan WA -> SKU. Dicek berurutan, yang pertama cocok dipakai.
KATA_KUNCI_WA = [
    ("niacin", "GLW-SRM-001"), ("bright 10", "GLW-SRM-001"),
    ("vit c", "GLW-SRM-002"), ("vitamin c", "GLW-SRM-002"),
    ("retinol", "GLW-SRM-003"),
    ("centella", "GLW-TNR-001"),
    ("aha", "GLW-TNR-002"), ("exfo", "GLW-TNR-002"),
    ("tone up", "GLW-SNS-002"),
    ("spf50", "GLW-SNS-001"), ("uv shield", "GLW-SNS-001"),
    ("ceramide", "GLW-MST-001"),
    ("gel moist", "GLW-MST-002"), ("oil control", "GLW-MST-002"),
    ("low ph", "GLW-FWS-001"), ("gentle", "GLW-FWS-001"),
    ("acne", "GLW-FWS-002"),
    ("rosy", "GLW-LTN-001"), ("coral", "GLW-LTN-002"),
    ("sheet mask", "GLW-MSK-001"), ("masker", "GLW-MSK-001"),
    ("starter kit", "GLW-SET-001"), ("paket bright", "GLW-SET-001"),
]

BULAN = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "mei": 5, "jun": 6, "jul": 7,
         "agu": 8, "agt": 8, "sep": 9, "okt": 10, "nov": 11, "des": 12}

laporan = Counter()       # penghitung perbaikan
contoh = defaultdict(list)  # contoh sebelum -> sesudah


def catat(jenis, sebelum, sesudah):
    laporan[jenis] += 1
    if len(contoh[jenis]) < 3:
        contoh[jenis].append(f"{sebelum!r} -> {sesudah!r}")


def baca_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def muat_master():
    master = {}
    for r in baca_csv(ROOT / "data" / "master_produk.csv"):
        master[r["sku"]] = r
    return master


def rapikan_sku(mentah, master):
    """'GLW-SRM-01' / 'glw-sns001 ' -> 'GLW-SRM-001'. None kalau tidak dikenali."""
    s = re.sub(r"\s+", "", mentah).upper()
    m = re.fullmatch(r"GLW-?([A-Z]{3})-?(\d{1,3})", s)
    if not m:
        return None
    sku = f"GLW-{m.group(1)}-{int(m.group(2)):03d}"
    if sku not in master:
        return None
    if sku != mentah:
        catat("SKU typo diperbaiki", mentah, sku)
    return sku


def nama_produk_resmi(mentah, sku, master):
    resmi = master[sku]["nama_produk"]
    rapi = " ".join(mentah.split())
    if rapi != mentah:
        catat("Spasi nama produk dirapikan", mentah, rapi)
    if rapi != resmi:
        print(f"  PERINGATAN: nama produk '{rapi}' beda dengan master '{resmi}' ({sku})")
    return resmi


def normal_hp(mentah):
    """Semua format -> 628xxxxxxxxx"""
    digit = re.sub(r"\D", "", mentah)
    if digit.startswith("0"):
        digit = "62" + digit[1:]
    elif digit.startswith("8"):
        digit = "62" + digit
    if not (digit.startswith("628") and 11 <= len(digit) <= 14):
        raise ValueError(f"Nomor HP tidak valid: {mentah!r}")
    if digit != mentah:
        catat("No HP diseragamkan", mentah, digit)
    return digit


def rapikan_nama(mentah):
    nama = " ".join(mentah.split())
    nama = re.sub(r"^(kak|ka|kk)\s+", "", nama, flags=re.IGNORECASE)
    nama = nama.title()
    if nama != mentah:
        catat("Nama pembeli dirapikan", mentah, nama)
    return nama


def angka_rupiah(teks):
    """'Rp119.000' / '119rb' / 'Rp 238.000,-' / 'free' -> int"""
    t = teks.strip().lower()
    if t in ("", "-", "free", "gratis"):
        return 0
    t = t.replace("rp", "").replace(",-", "").replace(" ", "")
    if t.endswith(("rb", "k")):
        return int(float(t.rstrip("rbk").replace(",", ".")) * 1000)
    return int(t.replace(".", ""))


def tanggal_wa(teks):
    """'9/9/2026' / '09-09-26' / '9 Sep 2026' -> date. Selalu dibaca hari-bulan-tahun."""
    t = teks.strip().lower()
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.fullmatch(r"(\d{1,2})\s+([a-z]+)\s+(\d{2}|\d{4})", t)
        if not m or m.group(2)[:3] not in BULAN:
            raise ValueError(f"Tanggal WA tidak dikenali: {teks!r}")
        d, mo, y = int(m.group(1)), BULAN[m.group(2)[:3]], int(m.group(3))
    if y < 100:
        y += 2000
    return datetime(y, mo, d).date()


def sku_dari_teks_wa(teks):
    t = teks.lower()
    for kunci, sku in KATA_KUNCI_WA:
        if kunci in t:
            return sku
    raise ValueError(f"Produk WA tidak dikenali: {teks!r}")


def status_wa(teks):
    t = teks.strip().lower()
    if t.startswith("retur"):
        return "retur"
    if t not in STATUS_WA:
        raise ValueError(f"Status WA tidak dikenali: {teks!r}")
    return STATUS_WA[t]


def proses_marketplace(channel, path, kolom, peta_status, format_tgl, master):
    hasil = []
    for r in baca_csv(path):
        sku = rapikan_sku(r[kolom["sku"]], master)
        if sku is None:
            raise ValueError(f"SKU tidak dikenali di {channel}: {r[kolom['sku']]!r}")
        hasil.append({
            "channel": channel,
            "no_pesanan": r[kolom["no"]].strip(),
            "tanggal": datetime.strptime(r[kolom["tgl"]].strip(), format_tgl).date().isoformat(),
            "sku": sku,
            "nama_produk": nama_produk_resmi(r[kolom["produk"]], sku, master),
            "qty": int(r[kolom["qty"]]),
            "harga_satuan": int(r[kolom["harga"]]),
            "ongkir": int(r[kolom["ongkir"]]),
            "nama_pembeli": rapikan_nama(r[kolom["nama"]]),
            "no_hp_normal": normal_hp(r[kolom["hp"]]),
            "status_normal": peta_status[r[kolom["status"]].strip()],
        })
    return hasil


def proses_whatsapp(master):
    hasil = []
    for r in baca_csv(RAW_DIR / "whatsapp_orders.csv"):
        tgl = tanggal_wa(r["Tgl"])
        sku = sku_dari_teks_wa(r["Pesanan"])
        catat("Produk WA dipetakan ke SKU", r["Pesanan"], sku)
        qty = int(re.sub(r"\D", "", r["Jml"]))
        total = angka_rupiah(r["Total"])
        harga = total // qty
        harga_master = int(master[sku]["harga_jual"])
        if harga != harga_master:
            print(f"  PERINGATAN: harga WA No {r['No']} = {harga}, master = {harga_master}")
        hasil.append({
            "channel": "whatsapp",
            "no_pesanan": f"WA-{tgl:%Y%m%d}-{int(r['No']):02d}",
            "tanggal": tgl.isoformat(),
            "sku": sku,
            "nama_produk": master[sku]["nama_produk"],
            "qty": qty,
            "harga_satuan": harga,
            "ongkir": angka_rupiah(r["Ongkir"]),
            "nama_pembeli": rapikan_nama(r["Nama"]),
            "no_hp_normal": normal_hp(r["No WA"]),
            "status_normal": status_wa(r["Status"]),
        })
    return hasil


def buang_duplikat(baris):
    unik, terlihat = [], set()
    for b in baris:
        kunci = (b["channel"], b["no_pesanan"], b["sku"])
        if kunci in terlihat:
            catat("Baris duplikat dibuang", f"{b['channel']} {b['no_pesanan']}", "(dihapus)")
            continue
        terlihat.add(kunci)
        unik.append(b)
    return unik


def main():
    master = muat_master()

    shopee = proses_marketplace(
        "shopee", RAW_DIR / "shopee_orders.csv",
        {"no": "No. Pesanan", "tgl": "Waktu Pesanan Dibuat", "sku": "SKU Induk", "produk": "Nama Produk",
         "qty": "Jumlah", "harga": "Harga Awal", "ongkir": "Ongkos Kirim Dibayar oleh Pembeli",
         "nama": "Nama Penerima", "hp": "No. Telepon", "status": "Status Pesanan"},
        STATUS_SHOPEE, "%Y-%m-%d %H:%M", master)
    tiktok = proses_marketplace(
        "tiktok", RAW_DIR / "tiktok_orders.csv",
        {"no": "Order ID", "tgl": "Created Time", "sku": "Seller SKU", "produk": "Product Name",
         "qty": "Quantity", "harga": "SKU Unit Original Price", "ongkir": "Shipping Fee",
         "nama": "Recipient", "hp": "Phone #", "status": "Order Status"},
        STATUS_TIKTOK, "%d/%m/%Y %H:%M:%S", master)
    whatsapp = proses_whatsapp(master)

    mentah = {"shopee": len(shopee), "tiktok": len(tiktok), "whatsapp": len(whatsapp)}
    gabungan = buang_duplikat(shopee + tiktok + whatsapp)
    gabungan.sort(key=lambda b: (b["tanggal"], b["channel"], b["no_pesanan"]))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=KOLOM_OUTPUT)
        w.writeheader()
        w.writerows(gabungan)

    # ---------- Laporan ----------
    per_channel = Counter(b["channel"] for b in gabungan)
    print("=" * 60)
    print("LAPORAN CLEANING & MERGE")
    print("=" * 60)
    for ch in ("shopee", "tiktok", "whatsapp"):
        print(f"  {ch:9}: {mentah[ch]:3} baris mentah -> {per_channel[ch]:3} baris bersih")
    print(f"  TOTAL    : {sum(mentah.values()):3} baris mentah -> {len(gabungan):3} baris bersih")

    print("\nPerbaikan yang dilakukan:")
    for jenis, n in laporan.items():
        print(f"  - {jenis}: {n}")
        for c in contoh[jenis]:
            print(f"      contoh: {c}")

    print("\nStatus per channel:")
    for ch in ("shopee", "tiktok", "whatsapp"):
        c = Counter(b["status_normal"] for b in gabungan if b["channel"] == ch)
        print(f"  {ch:9}: " + ", ".join(f"{s}={c[s]}" for s in
                                          ("selesai", "dikirim", "diproses", "batal", "retur")))

    order_per_hp = Counter(b["no_hp_normal"] for b in gabungan)
    channel_per_hp = defaultdict(set)
    for b in gabungan:
        channel_per_hp[b["no_hp_normal"]].add(b["channel"])
    repeat = [hp for hp, n in order_per_hp.items() if n > 1]
    lintas = [hp for hp, chs in channel_per_hp.items() if len(chs) > 1]
    print(f"\nPelanggan unik (berdasarkan no HP): {len(order_per_hp)}")
    print(f"Pelanggan repeat (>1 order)       : {len(repeat)} ({len(repeat) / len(order_per_hp):.1%})")
    print(f"Pelanggan lintas channel          : {len(lintas)}")
    print(f"\nFile tersimpan: {OUT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as e:
        print(f"GAGAL: {e}")
        sys.exit(1)
