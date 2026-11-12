"""
build_workbook.py — Membuat sheets/glowra_fondasi.xlsx berisi RUMUS ASLI (bukan angka jadi),
supaya bisa dipelajari & tetap jalan setelah di-upload ke Google Sheets.

Tab:
  Asumsi            fee marketplace & biaya packing (dari config/asumsi.json)
  Master_Produk     dari data/master_produk.csv
  Pesanan           data gabungan + kolom hitungan (Subtotal, HPP, Fee, Laba Kotor)
  Stok              stok awal, terjual, retur, stok akhir, status AMAN/RESTOCK
  Laba_per_Channel  ringkasan per channel + cek kecocokan omzet

Di akhir, script menghitung ulang semua angka dengan Python biasa (tanpa rumus) supaya hasil
rumus di spreadsheet bisa dicocokkan.

Jalankan dari folder project (setelah clean_merge.py):
    python scripts/build_workbook.py
"""

import csv
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "sheets" / "glowra_fondasi.xlsx"
CHANNELS = ["shopee", "tiktok", "whatsapp"]

# ---------- Gaya tampilan ----------
MERAH_TUA = "8C1C3A"
HEADER_FILL = PatternFill("solid", fgColor=MERAH_TUA)
HEADER_FONT = Font(bold=True, color="FFFFFF")
HITUNG_FILL = PatternFill("solid", fgColor="FDE2E4")    # kolom berisi rumus
INPUT_FILL = PatternFill("solid", fgColor="FFF3B0")     # sel asumsi yang boleh diubah
TOTAL_FONT = Font(bold=True)
JUDUL_FONT = Font(bold=True, size=14, color=MERAH_TUA)
CATATAN_FONT = Font(italic=True, color="7F4F24")
RUPIAH = '"Rp"#,##0'
PERSEN = "0.0%"


def baca_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def tulis_header(ws, baris, judul, fill=HEADER_FILL):
    for i, teks in enumerate(judul, start=1):
        c = ws.cell(row=baris, column=i, value=teks)
        c.fill, c.font = fill, HEADER_FONT
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def atur_lebar(ws, lebar):
    for i, w in enumerate(lebar, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


# ---------------------------------------------------------------------------
def tab_asumsi(wb, cfg):
    ws = wb.active
    ws.title = "Asumsi"
    ws["A1"] = "Asumsi Biaya: Glowra Beauty"
    ws["A1"].font = JUDUL_FONT
    ws["A2"] = ("⚠️ Semua angka di tab ini ASUMSI untuk studi kasus fiktif. Fee marketplace sering berubah, "
                "jadi cek ketentuan terbaru di Seller Center sebelum dipakai untuk toko asli.")
    ws["A2"].font = CATATAN_FONT

    tulis_header(ws, 4, ["Parameter", "Nilai", "Satuan", "Keterangan"])
    ws["A5"], ws["B5"], ws["C5"], ws["D5"] = ("Biaya packing per order", cfg["biaya_packing_per_order"],
                                              "Rp / order", "Bubble wrap, lakban, kardus, kartu ucapan")
    ws["B5"].number_format, ws["B5"].fill = RUPIAH, INPUT_FILL

    # Tabel fee per channel: baris 9-11 (dipakai rumus di tab lain, jangan dipindah)
    tulis_header(ws, 8, ["Channel", "Fee Admin & Layanan (%)", "Biaya Tetap per Order (Rp)", "Keterangan"])
    for i, ch in enumerate(CHANNELS):
        r = 9 + i
        c = cfg["channel"][ch]
        ws.cell(r, 1, ch)
        ws.cell(r, 2, c["fee_persen"]).number_format = PERSEN
        ws.cell(r, 3, c["biaya_tetap_per_order"]).number_format = RUPIAH
        ws.cell(r, 4, c["keterangan"])
        ws.cell(r, 2).fill = ws.cell(r, 3).fill = INPUT_FILL

    ws["A13"] = "Sel KUNING = boleh diubah. Semua rumus di tab lain otomatis ikut berubah."
    ws["A14"] = (f"Sumber angka: config/asumsi.json (terakhir ditinjau {cfg['terakhir_ditinjau']}). "
                 "Kalau mengubah file JSON, jalankan ulang: python scripts/build_workbook.py")
    ws["A13"].font = ws["A14"].font = CATATAN_FONT
    atur_lebar(ws, [26, 24, 26, 60])


def tab_master(wb, produk):
    ws = wb.create_sheet("Master_Produk")
    kolom = ["sku", "nama_produk", "kategori", "hpp", "harga_jual", "stok_awal", "stok_minimum"]
    tulis_header(ws, 1, kolom)
    for r, p in enumerate(produk, start=2):
        ws.cell(r, 1, p["sku"])
        ws.cell(r, 2, p["nama_produk"])
        ws.cell(r, 3, p["kategori"])
        for c, k in enumerate(["hpp", "harga_jual", "stok_awal", "stok_minimum"], start=4):
            ws.cell(r, c, int(p[k]))
        ws.cell(r, 4).number_format = ws.cell(r, 5).number_format = RUPIAH
    ws.freeze_panes = "A2"
    atur_lebar(ws, [14, 46, 13, 12, 13, 11, 14])


def tab_pesanan(wb, orders):
    """Kolom A-K = data, L-Q = rumus. Ringkasan total di kolom S-T."""
    ws = wb.create_sheet("Pesanan")
    kolom = ["channel", "no_pesanan", "tanggal", "sku", "nama_produk", "qty", "harga_satuan", "ongkir",
             "nama_pembeli", "no_hp_normal", "status_normal",
             "Bulan", "Masuk Laporan?", "Subtotal", "HPP", "Fee Marketplace", "Laba Kotor"]
    tulis_header(ws, 1, kolom)
    for c in range(12, 18):
        ws.cell(1, c).fill = PatternFill("solid", fgColor="C9184A")

    for r, o in enumerate(orders, start=2):
        ws.cell(r, 1, o["channel"])
        ws.cell(r, 2, o["no_pesanan"])                       # teks, supaya 18 digit TikTok utuh
        ws.cell(r, 3, date.fromisoformat(o["tanggal"])).number_format = "yyyy-mm-dd"
        ws.cell(r, 4, o["sku"])
        ws.cell(r, 5, o["nama_produk"])
        ws.cell(r, 6, int(o["qty"]))
        ws.cell(r, 7, int(o["harga_satuan"])).number_format = RUPIAH
        ws.cell(r, 8, int(o["ongkir"])).number_format = RUPIAH
        ws.cell(r, 9, o["nama_pembeli"])
        ws.cell(r, 10, o["no_hp_normal"])                    # teks, supaya tidak jadi 6,28E+11
        ws.cell(r, 11, o["status_normal"])

        # ---- Rumus ----
        ws.cell(r, 12, f'=YEAR(C{r})&"-"&TEXT(MONTH(C{r}),"00")')
        ws.cell(r, 13, f'=IF(OR(K{r}="selesai",K{r}="dikirim"),"YA","TIDAK")')
        ws.cell(r, 14, f"=F{r}*G{r}")
        ws.cell(r, 15, f"=F{r}*_xlfn.XLOOKUP(D{r},Master_Produk!$A:$A,Master_Produk!$D:$D)")
        ws.cell(r, 16, f"=N{r}*_xlfn.XLOOKUP(A{r},Asumsi!$A$9:$A$11,Asumsi!$B$9:$B$11)"
                       f"+_xlfn.XLOOKUP(A{r},Asumsi!$A$9:$A$11,Asumsi!$C$9:$C$11)")
        ws.cell(r, 17, f"=N{r}-O{r}-P{r}")
        for c in range(14, 18):
            ws.cell(r, c).number_format = RUPIAH
        for c in range(12, 18):
            ws.cell(r, c).fill = HITUNG_FILL

    # ---- Ringkasan total (dipakai untuk cek kecocokan di Laba_per_Channel) ----
    ws["S1"] = "RINGKASAN (status selesai + dikirim)"
    ws["S1"].font = TOTAL_FONT
    ringkasan = [
        ("Jumlah order", '=COUNTIFS(M:M,"YA")', None),
        ("Total omzet", '=SUMIFS(N:N,M:M,"YA")', RUPIAH),
        ("Total HPP", '=SUMIFS(O:O,M:M,"YA")', RUPIAH),
        ("Total fee marketplace", '=SUMIFS(P:P,M:M,"YA")', RUPIAH),
        ("Total laba kotor", '=SUMIFS(Q:Q,M:M,"YA")', RUPIAH),
    ]
    for i, (label, rumus, fmt) in enumerate(ringkasan, start=2):
        ws.cell(i, 19, label)
        c = ws.cell(i, 20, rumus)
        c.font = TOTAL_FONT
        if fmt:
            c.number_format = fmt

    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:Q{len(orders) + 1}"
    atur_lebar(ws, [10, 21, 12, 13, 44, 6, 13, 10, 20, 15, 13, 9, 10, 13, 12, 14, 13, 3, 24, 16])


def tab_stok(wb, n_produk):
    ws = wb.create_sheet("Stok")
    tulis_header(ws, 1, ["SKU", "Nama Produk", "Stok Awal", "Terjual (selesai+dikirim)", "Retur",
                         "Stok Akhir", "Stok Minimum", "Status"])
    for i in range(n_produk):
        r = i + 2
        ws.cell(r, 1, f"=Master_Produk!A{r}")
        ws.cell(r, 2, f"=Master_Produk!B{r}")
        ws.cell(r, 3, f"=_xlfn.XLOOKUP($A{r},Master_Produk!$A:$A,Master_Produk!$F:$F)")
        ws.cell(r, 4, f'=SUMIFS(Pesanan!$F:$F,Pesanan!$D:$D,$A{r},Pesanan!$K:$K,"selesai")'
                      f'+SUMIFS(Pesanan!$F:$F,Pesanan!$D:$D,$A{r},Pesanan!$K:$K,"dikirim")')
        ws.cell(r, 5, f'=SUMIFS(Pesanan!$F:$F,Pesanan!$D:$D,$A{r},Pesanan!$K:$K,"retur")')
        ws.cell(r, 6, f"=C{r}-D{r}")
        ws.cell(r, 7, f"=_xlfn.XLOOKUP($A{r},Master_Produk!$A:$A,Master_Produk!$G:$G)")
        ws.cell(r, 8, f'=IF(F{r}<G{r},"RESTOCK","AMAN")')
        ws.cell(r, 8).alignment = Alignment(horizontal="center")
        ws.cell(r, 8).font = TOTAL_FONT

    akhir = n_produk + 1
    ws.conditional_formatting.add(
        f"H2:H{akhir}", FormulaRule(formula=['$H2="RESTOCK"'], fill=PatternFill("solid", fgColor="F8D7DA"),
                                    font=Font(bold=True, color="9B1C1C")))
    ws.conditional_formatting.add(
        f"H2:H{akhir}", FormulaRule(formula=['$H2="AMAN"'], fill=PatternFill("solid", fgColor="D8F3DC"),
                                    font=Font(bold=True, color="2D6A4F")))

    ws.cell(akhir + 2, 1, "Catatan: barang retur dianggap sudah kembali ke gudang & layak jual, jadi tidak "
                         "mengurangi stok. Kolom Retur hanya informasi.").font = CATATAN_FONT
    ws.cell(akhir + 3, 1, "Pesanan 'diproses' (belum dikirim) belum memotong stok.").font = CATATAN_FONT
    ws.freeze_panes = "C2"
    atur_lebar(ws, [14, 46, 11, 15, 8, 11, 13, 12])


def tab_laba(wb):
    ws = wb.create_sheet("Laba_per_Channel")
    ws["A1"] = "Laba per Channel: Glowra Beauty"
    ws["A1"].font = JUDUL_FONT
    ws["A2"] = ("Omzet, HPP, fee & packing hanya menghitung pesanan berstatus selesai + dikirim. "
                "Batal & retur tidak dihitung sebagai penjualan.")
    ws["A2"].font = CATATAN_FONT

    tulis_header(ws, 4, ["Channel", "Total Order", "Order Batal", "Order Retur", "Order Masuk Laporan",
                         "Omzet", "Total HPP", "Total Fee", "Biaya Packing", "Laba Bersih", "Margin %"])
    ws.row_dimensions[4].height = 32
    P = "Pesanan!"
    for i, ch in enumerate(CHANNELS):
        r = 5 + i
        ws.cell(r, 1, ch)
        ws.cell(r, 2, f"=COUNTIFS({P}$A:$A,$A{r})")
        ws.cell(r, 3, f'=COUNTIFS({P}$A:$A,$A{r},{P}$K:$K,"batal")')
        ws.cell(r, 4, f'=COUNTIFS({P}$A:$A,$A{r},{P}$K:$K,"retur")')
        ws.cell(r, 5, f'=COUNTIFS({P}$A:$A,$A{r},{P}$M:$M,"YA")')
        ws.cell(r, 6, f'=SUMIFS({P}$N:$N,{P}$A:$A,$A{r},{P}$M:$M,"YA")')
        ws.cell(r, 7, f'=SUMIFS({P}$O:$O,{P}$A:$A,$A{r},{P}$M:$M,"YA")')
        ws.cell(r, 8, f'=SUMIFS({P}$P:$P,{P}$A:$A,$A{r},{P}$M:$M,"YA")')
        ws.cell(r, 9, f"=E{r}*Asumsi!$B$5")
        ws.cell(r, 10, f"=F{r}-G{r}-H{r}-I{r}")
        ws.cell(r, 11, f"=IF(F{r}=0,0,J{r}/F{r})")

    ws.cell(8, 1, "TOTAL")
    for c in range(2, 11):
        col = get_column_letter(c)
        ws.cell(8, c, f"=SUM({col}5:{col}7)")
    ws.cell(8, 11, "=IF(F8=0,0,J8/F8)")
    for r in range(5, 9):
        for c in range(6, 11):
            ws.cell(r, c).number_format = RUPIAH
        ws.cell(r, 11).number_format = PERSEN
    for c in range(1, 12):
        ws.cell(8, c).font = TOTAL_FONT
        ws.cell(8, c).fill = HITUNG_FILL

    # ---- Cek kecocokan dengan tab Pesanan ----
    ws["A11"] = "CEK KECOCOKAN"
    ws["A11"].font = TOTAL_FONT
    ws["A12"], ws["B12"] = "Total omzet di tab ini", "=F8"
    ws["A13"], ws["B13"] = "Total omzet di tab Pesanan", "=Pesanan!$T$3"
    ws["A14"], ws["B14"] = "Selisih", "=B12-B13"
    ws["A15"], ws["B15"] = "Hasil", '=IF(B14=0,"COCOK ✅","TIDAK COCOK ❌")'
    for r in (12, 13, 14):
        ws.cell(r, 2).number_format = RUPIAH
    ws["B15"].font = TOTAL_FONT
    ws.freeze_panes = "B5"
    atur_lebar(ws, [26, 16, 10, 10, 13, 16, 15, 14, 14, 15, 10])


# ---------------------------------------------------------------------------
def hitung_ulang_python(orders, produk, cfg):
    """Hitung angka yang SEHARUSNYA muncul di spreadsheet, tanpa rumus."""
    hpp = {p["sku"]: int(p["hpp"]) for p in produk}
    per_ch = defaultdict(lambda: defaultdict(float))
    for o in orders:
        ch = o["channel"]
        per_ch[ch]["order"] += 1
        per_ch[ch][o["status_normal"]] += 1
        if o["status_normal"] in ("selesai", "dikirim"):
            sub = int(o["qty"]) * int(o["harga_satuan"])
            c = cfg["channel"][ch]
            per_ch[ch]["masuk"] += 1
            per_ch[ch]["omzet"] += sub
            per_ch[ch]["hpp"] += int(o["qty"]) * hpp[o["sku"]]
            per_ch[ch]["fee"] += sub * c["fee_persen"] + c["biaya_tetap_per_order"]
    for ch in CHANNELS:
        d = per_ch[ch]
        d["packing"] = d["masuk"] * cfg["biaya_packing_per_order"]
        d["laba"] = d["omzet"] - d["hpp"] - d["fee"] - d["packing"]
    return per_ch


def main():
    cfg = json.loads((ROOT / "config" / "asumsi.json").read_text(encoding="utf-8"))
    produk = baca_csv(ROOT / "data" / "master_produk.csv")
    orders = baca_csv(ROOT / "data" / "clean" / "orders_gabungan.csv")

    wb = Workbook()
    tab_asumsi(wb, cfg)
    tab_master(wb, produk)
    tab_pesanan(wb, orders)
    tab_stok(wb, len(produk))
    tab_laba(wb)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT_PATH)
    print(f"Workbook tersimpan: {OUT_PATH.relative_to(ROOT)}  ({len(orders)} pesanan, {len(produk)} produk)")

    per_ch = hitung_ulang_python(orders, produk, cfg)
    print("\nAngka yang SEHARUSNYA muncul di tab Laba_per_Channel (dihitung ulang dengan Python):")
    print(f"{'channel':10}{'order':>6}{'masuk':>6}{'omzet':>14}{'hpp':>13}{'fee':>12}{'packing':>10}{'laba':>13}{'margin':>8}")
    tot = defaultdict(float)
    for ch in CHANNELS:
        d = per_ch[ch]
        for k in ("order", "masuk", "omzet", "hpp", "fee", "packing", "laba"):
            tot[k] += d[k]
        print(f"{ch:10}{d['order']:>6.0f}{d['masuk']:>6.0f}{d['omzet']:>14,.0f}{d['hpp']:>13,.0f}"
              f"{d['fee']:>12,.0f}{d['packing']:>10,.0f}{d['laba']:>13,.0f}{d['laba'] / d['omzet']:>8.1%}")
    print(f"{'TOTAL':10}{tot['order']:>6.0f}{tot['masuk']:>6.0f}{tot['omzet']:>14,.0f}{tot['hpp']:>13,.0f}"
          f"{tot['fee']:>12,.0f}{tot['packing']:>10,.0f}{tot['laba']:>13,.0f}{tot['laba'] / tot['omzet']:>8.1%}")


if __name__ == "__main__":
    main()
