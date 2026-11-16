import type { Metadata } from "next";
import UjiStok from "@/components/UjiStok";

export const metadata: Metadata = { title: "Uji Stok & Bot Telegram · Glowra Beauty (toko demo)" };

export default function HalamanUjiStok() {
  return <UjiStok />;
}
