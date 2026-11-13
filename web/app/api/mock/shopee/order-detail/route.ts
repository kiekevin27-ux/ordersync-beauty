import { NextResponse } from "next/server";
import { detailShopee } from "@/lib/simulator";

/** API TIRUAN Shopee "get_order_detail" — dipanggil oleh n8n workflow 04. Khusus demo. */
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("order_sn_list") ?? "").split(",").filter(Boolean);
  return NextResponse.json(detailShopee(ids));
}
