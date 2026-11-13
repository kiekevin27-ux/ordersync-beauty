import type { Config } from "tailwindcss";

// Palet mengikuti workbook Glowra (merah tua 8C1C3A, mawar C9184A, blush FDE2E4).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        anggur: { DEFAULT: "#8C1C3A", tua: "#5E1027", muda: "#A8324F" },
        mawar: { DEFAULT: "#C9184A", muda: "#E04F74" },
        blush: { DEFAULT: "#FDE2E4", muda: "#FFF1F2", tua: "#F7C6CC" },
        krem: "#FFFAF7",
        tinta: { DEFAULT: "#2A1218", lembut: "#6B4A52" },
      },
      fontFamily: {
        judul: ["var(--font-judul)", "Georgia", "serif"],
        badan: ["var(--font-badan)", "system-ui", "sans-serif"],
        kode: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        kartu: "0 1px 2px rgba(94,16,39,.06), 0 8px 24px -12px rgba(94,16,39,.18)",
      },
    },
  },
  plugins: [],
};

export default config;
