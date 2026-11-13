import type { Metadata } from "next";
import Checkout from "@/components/Checkout";

export const metadata: Metadata = { title: "Checkout · Glowra Beauty (toko demo)" };

export default function HalamanCheckout() {
  return <Checkout />;
}
