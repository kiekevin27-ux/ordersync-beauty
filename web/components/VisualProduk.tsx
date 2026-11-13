/**
 * Ilustrasi kemasan produk (SVG), dibedakan per kategori. Dipakai karena Glowra toko fiktif:
 * tidak ada foto produk asli.
 */

const WARNA: Record<string, { latar: string; botol: string; tutup: string; label: string }> = {
  Serum: { latar: "#FDE2E4", botol: "#F4A6B4", tutup: "#8C1C3A", label: "#FFF1F2" },
  Toner: { latar: "#E7F1EC", botol: "#B9D8C8", tutup: "#3F6B57", label: "#F6FBF8" },
  Sunscreen: { latar: "#FFF1D6", botol: "#FFD28A", tutup: "#C77D12", label: "#FFFAF0" },
  Moisturizer: { latar: "#EAE6F7", botol: "#C9BFEA", tutup: "#5B4B9A", label: "#F7F5FD" },
  "Facial Wash": { latar: "#E3F0F8", botol: "#A9D0EA", tutup: "#2F6E95", label: "#F4FAFD" },
  "Lip Tint": { latar: "#FCE4EC", botol: "#E04F74", tutup: "#5E1027", label: "#FFF1F2" },
  Masker: { latar: "#F2EEE6", botol: "#DCCFB8", tutup: "#7A6544", label: "#FBF8F2" },
  Paket: { latar: "#FDE2E4", botol: "#C9184A", tutup: "#5E1027", label: "#FFF1F2" },
};

export default function VisualProduk({ kategori, sku, className = "" }: { kategori: string; sku: string; className?: string }) {
  const w = WARNA[kategori] ?? WARNA.Serum;
  // Varian warna kecil per SKU (mis. Lip Tint Rosy vs Coral)
  const coral = sku === "GLW-LTN-002";
  const botol = coral ? "#F4845F" : w.botol;

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={`Ilustrasi kemasan ${kategori}`}>
      <rect width="200" height="200" fill={w.latar} />
      <circle cx="160" cy="40" r="46" fill="#fff" opacity=".35" />
      <ellipse cx="100" cy="176" rx="52" ry="7" fill="#000" opacity=".07" />
      {kategori === "Serum" && (
        <g>
          <rect x="88" y="34" width="24" height="30" rx="6" fill={w.tutup} />
          <rect x="94" y="22" width="12" height="16" rx="6" fill={w.tutup} opacity=".8" />
          <rect x="70" y="60" width="60" height="114" rx="14" fill={botol} />
          <rect x="80" y="92" width="40" height="46" rx="5" fill={w.label} />
        </g>
      )}
      {kategori === "Toner" && (
        <g>
          <rect x="86" y="26" width="28" height="22" rx="4" fill={w.tutup} />
          <rect x="66" y="46" width="68" height="128" rx="10" fill={botol} />
          <rect x="74" y="88" width="52" height="56" rx="4" fill={w.label} />
        </g>
      )}
      {(kategori === "Sunscreen" || kategori === "Facial Wash") && (
        <g>
          <path d="M70 40 h60 l-6 120 a8 8 0 0 1 -8 7 h-32 a8 8 0 0 1 -8 -7 z" fill={botol} />
          <rect x="80" y="160" width="40" height="16" rx="4" fill={w.tutup} />
          <rect x="66" y="34" width="68" height="10" rx="3" fill={w.tutup} opacity=".85" />
          <rect x="82" y="74" width="36" height="50" rx="4" fill={w.label} />
        </g>
      )}
      {kategori === "Moisturizer" && (
        <g>
          <rect x="52" y="82" width="96" height="26" rx="8" fill={w.tutup} />
          <rect x="56" y="104" width="88" height="70" rx="14" fill={botol} />
          <rect x="72" y="124" width="56" height="30" rx="4" fill={w.label} />
        </g>
      )}
      {kategori === "Lip Tint" && (
        <g>
          <rect x="86" y="28" width="28" height="70" rx="12" fill={w.tutup} />
          <rect x="82" y="94" width="36" height="80" rx="10" fill={botol} />
          <rect x="90" y="120" width="20" height="34" rx="3" fill={w.label} opacity=".9" />
        </g>
      )}
      {kategori === "Masker" && (
        <g>
          <path d="M58 44 h84 v126 h-84 z" fill={botol} />
          <path d="M58 44 h84 v10 h-84 z M58 160 h84 v10 h-84 z" fill={w.tutup} opacity=".5" />
          <ellipse cx="100" cy="100" rx="24" ry="30" fill={w.label} />
          <circle cx="92" cy="94" r="3" fill={w.tutup} />
          <circle cx="108" cy="94" r="3" fill={w.tutup} />
          <path d="M92 112 q8 6 16 0" stroke={w.tutup} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )}
      {kategori === "Paket" && (
        <g>
          <rect x="46" y="86" width="108" height="88" rx="8" fill={botol} />
          <rect x="40" y="70" width="120" height="24" rx="6" fill={w.tutup} />
          <rect x="94" y="70" width="12" height="104" fill={w.label} opacity=".85" />
          <path d="M100 70 c-18 -26 -38 -10 -22 0 z M100 70 c18 -26 38 -10 22 0 z" fill={w.label} />
        </g>
      )}
    </svg>
  );
}
