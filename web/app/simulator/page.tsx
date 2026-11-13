import type { Metadata } from "next";
import SimulatorMarketplace from "@/components/SimulatorMarketplace";

export const metadata: Metadata = { title: "Simulator Marketplace · Glowra Beauty (toko demo)" };

export default function HalamanSimulator() {
  return <SimulatorMarketplace />;
}
