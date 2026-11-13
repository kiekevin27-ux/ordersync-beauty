/**
 * Batang horizontal 1 seri: label kiri, nilai di ujung batang (selalu terlihat, jadi tidak perlu
 * tabel terpisah). Batang tipis (≤ 12px), ujung membulat 4px, pangkal rata di garis dasar.
 */
export default function Batang({
  data,
  format = (n: number) => n.toLocaleString("id-ID"),
  keterangan,
}: {
  data: { label: string; sub?: string; nilai: number; info?: string }[];
  format?: (n: number) => string;
  keterangan?: (d: { label: string; nilai: number; info?: string }) => string;
}) {
  const maks = Math.max(1, ...data.map((d) => d.nilai));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="group grid grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,9.5rem)_1fr]" title={keterangan?.(d)}>
          <div className="min-w-0">
            <p className="truncate text-sm text-tinta">{d.label}</p>
            {d.sub && <p className="truncate font-kode text-[11px] text-tinta-lembut">{d.sub}</p>}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {/* lebar batang dihitung dari ruang setelah dikurangi tempat angka (±6rem), jadi angka selalu muat */}
            <div
              className="h-3 shrink-0 rounded-r-[4px] bg-[var(--seri)] transition-opacity group-hover:opacity-80"
              style={{ width: `max(3px, calc((100% - 6rem) * ${(d.nilai / maks).toFixed(4)}))` }}
            />
            <span className="shrink-0 text-xs font-semibold tabular-nums text-tinta">{format(d.nilai)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
