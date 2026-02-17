'use client';

import { useLivePrice } from '@/contexts/LivePriceContext';

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function PriceCards() {
  const { btc, eth, connected, error } = useLivePrice();

  if (error) {
    return (
      <div className="rounded-lg bg-[#131722] p-4 text-red-400">{error}</div>
    );
  }

  const noDataYet = btc === 0 && eth === 0;
  if (noDataYet && !connected) {
    return (
      <div className="flex gap-4">
        <div className="h-24 w-48 animate-pulse rounded-lg bg-[#1e293b]" />
        <div className="h-24 w-48 animate-pulse rounded-lg bg-[#1e293b]" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="rounded-lg bg-[#131722] px-5 py-4 shadow-lg ring-1 ring-[#334155]">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#787b86]">Bitcoin</p>
          {connected && (
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" title="Precio en vivo" />
          )}
        </div>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(btc)}
        </p>
      </div>
      <div className="rounded-lg bg-[#131722] px-5 py-4 shadow-lg ring-1 ring-[#334155]">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#787b86]">Ethereum</p>
          {connected && (
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" title="Precio en vivo" />
          )}
        </div>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(eth)}
        </p>
      </div>
    </div>
  );
}
