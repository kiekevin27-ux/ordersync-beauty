/**
 * Membaca Google Sheet dengan service account (hanya di SERVER; kunci tidak pernah dikirim ke browser).
 *
 * Pengaturan (web/.env.local atau Environment Variables di Vercel):
 *   GOOGLE_SHEET_ID                  ID sheet (bagian URL setelah /d/)
 *   GOOGLE_SERVICE_ACCOUNT_FILE      path file kunci .json (untuk laptop), ATAU
 *   GOOGLE_SERVICE_ACCOUNT_JSON      isi file kunci .json (untuk Vercel)
 * Membaca memakai izin BACA saja (spreadsheets.readonly). Izin TULIS (spreadsheets) hanya diminta oleh
 * fungsi tulis di bawah (dipakai mesin otomasi versi Vercel: lib/gerbang.ts & lib/stok.ts).
 */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

type Kunci = { client_email: string; private_key: string };

function bacaKunci(): Kunci | null {
  try {
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) return JSON.parse(readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"));
  } catch {
    return null;
  }
  return null;
}

export const sheetsTersambung = () => Boolean(process.env.GOOGLE_SHEET_ID && bacaKunci());

/** Penjelasan kenapa belum tersambung (tanpa pernah menampilkan isi kunci). */
export function alasanBelumTersambung(): string {
  const kurang: string[] = [];
  if (!process.env.GOOGLE_SHEET_ID) kurang.push("GOOGLE_SHEET_ID kosong");
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!json && !file) kurang.push("GOOGLE_SERVICE_ACCOUNT_JSON kosong");
  else if (!bacaKunci()) {
    kurang.push(json
      ? `GOOGLE_SERVICE_ACCOUNT_JSON terisi (${json.length} karakter) tapi bukan JSON yang utuh: salin ulang seluruh isi file kunci`
      : "GOOGLE_SERVICE_ACCOUNT_FILE tidak bisa dibaca");
  }
  return kurang.length ? `Pengaturan belum lengkap: ${kurang.join("; ")}.` : "";
}

const IZIN_BACA = "https://www.googleapis.com/auth/spreadsheets.readonly";
const IZIN_TULIS = "https://www.googleapis.com/auth/spreadsheets";
const tokenTersimpan = new Map<string, { nilai: string; habis: number }>();

async function aksesToken(scope = IZIN_BACA): Promise<string> {
  const token = tokenTersimpan.get(scope);
  if (token && token.habis > Date.now() + 60_000) return token.nilai;
  const k = bacaKunci();
  if (!k) throw new Error("Kunci service account belum diatur");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const isi = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: k.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const jwt = `${isi}.${createSign("RSA-SHA256").update(isi).sign(k.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    cache: "no-store",
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Gagal login Google: ${j.error_description ?? j.error ?? res.status}`);
  tokenTersimpan.set(scope, { nilai: j.access_token, habis: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

/** Baca beberapa tab sekaligus. Baris pertama = header; hasilnya array objek per baris. */
export async function bacaTab(tab: string[]): Promise<Record<string, Record<string, unknown>[]>> {
  const id = process.env.GOOGLE_SHEET_ID;
  const qs = tab.map((t) => `ranges=${encodeURIComponent(t)}`).join("&");
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${await aksesToken()}` }, cache: "no-store" },
  );
  const j = await res.json();
  if (!res.ok) throw new Error(`Google Sheets: ${j.error?.message ?? res.status}`);
  const hasil: Record<string, Record<string, unknown>[]> = {};
  j.valueRanges.forEach((vr: { values?: unknown[][] }, i: number) => {
    const [header = [], ...baris] = vr.values ?? [];
    hasil[tab[i]] = baris.map((r) => Object.fromEntries((header as string[]).map((h, c) => [h, r[c] ?? ""])));
  });
  return hasil;
}

// ---------------------------------------------------------------------------
// TULIS (mesin otomasi versi Vercel)
// ---------------------------------------------------------------------------
const URL_SHEET = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}`;

async function panggil(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_SHEET()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await aksesToken(IZIN_TULIS)}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Sheets: ${j.error?.message ?? res.status}`);
  return j;
}

/** Huruf kolom: 0 → A, 25 → Z, 26 → AA. */
export function hurufKolom(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const rentang = (tab: string, r: string) => encodeURIComponent(`'${tab}'!${r}`);

/** Baca isi tab apa adanya (array baris). Kosong kalau tab belum ada isinya. */
export async function bacaMentah(tab: string): Promise<unknown[][]> {
  const j = await panggil(`/values/${rentang(tab, "A1:ZZ")}?valueRenderOption=UNFORMATTED_VALUE`);
  return (j.values ?? []) as unknown[][];
}

/** Buat tab baru kalau belum ada. */
export async function pastikanTab(tab: string): Promise<void> {
  const j = await panggil(`?fields=sheets.properties.title`);
  const ada = (j.sheets ?? []).some((s: { properties: { title: string } }) => s.properties.title === tab);
  if (!ada) await panggil(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
}

/** Tulis nilai ke rentang tertentu (RAW = disimpan apa adanya, tidak ditebak Google). */
export async function tulisRentang(tab: string, r: string, values: unknown[][]): Promise<void> {
  await panggil(`/values/${rentang(tab, r)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values }) });
}

/**
 * UPSERT: baris yang `kunci`-nya sudah ada DIPERBARUI, sisanya DITAMBAHKAN di bawah.
 * Sama dengan node Google Sheets n8n "appendOrUpdate" + auto-map + insertInNewColumn:
 *  - nama field = nama kolom; kolom yang belum ada dibuat di ujung header,
 *  - kolom lain di baris yang sama tidak disentuh,
 *  - semua perubahan dikirim dalam 1-2 panggilan (hemat kuota Google ±60/menit).
 */
export async function upsertBaris(tab: string, baris: Record<string, unknown>[], kunci: string) {
  const isi = await bacaMentah(tab);
  const header = ((isi[0] ?? []) as unknown[]).map(String);
  const headerBaru = [...header];
  for (const b of baris) for (const k of Object.keys(b)) if (!headerBaru.includes(k)) headerBaru.push(k);
  const kolomKunci = headerBaru.indexOf(kunci);

  const posisi = new Map<string, number>(); // nilai kunci -> nomor baris di sheet (1 = header)
  isi.slice(1).forEach((r, i) => {
    const v = String((r as unknown[])[kolomKunci] ?? "");
    if (v) posisi.set(v, i + 2);
  });

  const akhir = hurufKolom(headerBaru.length - 1);
  const data: { range: string; values: unknown[][] }[] = [];
  if (headerBaru.length !== header.length) data.push({ range: `'${tab}'!A1:${akhir}1`, values: [headerBaru] });

  const tambah: unknown[][] = [];
  const sebelum: Record<string, unknown>[] = []; // isi lama baris yang diperbarui (untuk mendeteksi perubahan status)
  let diperbarui = 0;
  for (const b of baris) {
    const no = posisi.get(String(b[kunci]));
    if (no) {
      const lama = [...((isi[no - 1] ?? []) as unknown[])];
      sebelum.push(Object.fromEntries(header.map((h, c) => [h, lama[c] ?? ""])));
      const r = headerBaru.map((h, c) => (h in b ? b[h] : lama[c] ?? ""));
      data.push({ range: `'${tab}'!A${no}:${akhir}${no}`, values: [r] });
      diperbarui++;
    } else {
      tambah.push(headerBaru.map((h) => (h in b ? b[h] : "")));
    }
  }
  if (data.length) {
    await panggil(`/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data }) });
  }
  // Baris baru: "append" otomatis menambah baris di bawah tabel (sheet ikut membesar kalau perlu).
  if (tambah.length) {
    await panggil(`/values/${rentang(tab, `A1:${akhir}1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: tambah }),
    });
  }
  return { ditambah: tambah.length, diperbarui, sebelum };
}

/** Hapus semua baris yang nilai `kolom`-nya diawali `awalan` (dipakai halaman Uji Stok). */
export async function hapusBarisAwalan(tab: string, kolom: string, awalan: string): Promise<number> {
  const isi = await bacaMentah(tab);
  const c = ((isi[0] ?? []) as unknown[]).map(String).indexOf(kolom);
  if (c < 0 || !awalan) return 0;
  const nomor = isi
    .map((r, i) => ({ v: String((r as unknown[])[c] ?? ""), i }))
    .filter((x) => x.i > 0 && x.v.startsWith(awalan))
    .map((x) => x.i)
    .sort((a, b) => b - a); // dari bawah ke atas, supaya nomor baris di atasnya tidak bergeser
  if (!nomor.length) return 0;
  const meta = await panggil(`?fields=sheets.properties`);
  const sheetId = meta.sheets.find((s: { properties: { title: string } }) => s.properties.title === tab)?.properties.sheetId;
  if (sheetId === undefined) return 0;
  await panggil(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: nomor.map((i) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i + 1 } } })),
    }),
  });
  return nomor.length;
}
