import { NextResponse } from "next/server";
import { detailTiktok } from "@/lib/simulator";

/** API TIRUAN TikTok Shop "Get Order Detail" — dipanggil oleh n8n workflow 04. Khusus demo. */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
  return NextResponse.json(detailTiktok(ids));
}
