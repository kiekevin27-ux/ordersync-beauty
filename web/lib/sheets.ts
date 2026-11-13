/**
 * Membaca Google Sheet dengan service account (hanya di SERVER; kunci tidak pernah dikirim ke browser).
 *
 * Pengaturan (web/.env.local atau Environment Variables di Vercel):
 *   GOOGLE_SHEET_ID                  ID sheet (bagian URL setelah /d/)
 *   GOOGLE_SERVICE_ACCOUNT_FILE      path file kunci .json (untuk laptop), ATAU
 *   GOOGLE_SERVICE_ACCOUNT_JSON      isi file kunci .json (untuk Vercel)
 * Izin yang diminta hanya BACA (spreadsheets.readonly).
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

let token: { nilai: string; habis: number } | null = null;

async function aksesToken(): Promise<string> {
  if (token && token.habis > Date.now() + 60_000) return token.nilai;
  const k = bacaKunci();
  if (!k) throw new Error("Kunci service account belum diatur");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const isi = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
  token = { nilai: j.access_token, habis: Date.now() + j.expires_in * 1000 };
  return token.nilai;
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
