"use client";

export default function PengaturQty({ qty, onUbah, nama }: { qty: number; onUbah: (q: number) => void; nama: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-blush-tua bg-white">
      <button onClick={() => onUbah(qty - 1)} className="h-8 w-8 rounded-full text-anggur hover:bg-blush-muda" aria-label={`Kurangi ${nama}`}>
        −
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums">{qty}</span>
      <button onClick={() => onUbah(qty + 1)} className="h-8 w-8 rounded-full text-anggur hover:bg-blush-muda" aria-label={`Tambah ${nama}`}>
        +
      </button>
    </div>
  );
}
