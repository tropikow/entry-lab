'use client';

import { useEffect, useState } from 'react';

type Prices = { btc: string; eth: string } | null;

export default function PriceCards() {
  const [prices, setPrices] = useState<Prices>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPrices = async () => {
      try {
        const res = await fetch('/api/crypto/price');
        if (!res.ok) throw new Error('Failed to fetch prices');
        const data = await res.json();
        if (!cancelled) setPrices(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      }
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-[#131722] p-4 text-red-400">{error}</div>
    );
  }

  if (!prices) {
    return (
      <div className="flex gap-4">
        <div className="h-24 w-48 animate-pulse rounded-lg bg-[#1e293b]" />
        <div className="h-24 w-48 animate-pulse rounded-lg bg-[#1e293b]" />
      </div>
    );
  }

  const formatPrice = (s: string) => {
    const n = parseFloat(s);
    if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  return (
    <div className="flex flex-wrap gap-4">
      <div className="rounded-lg bg-[#131722] px-5 py-4 shadow-lg ring-1 ring-[#334155]">
        <p className="text-sm font-medium text-[#787b86]">Bitcoin</p>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(prices.btc)}
        </p>
      </div>
      <div className="rounded-lg bg-[#131722] px-5 py-4 shadow-lg ring-1 ring-[#334155]">
        <p className="text-sm font-medium text-[#787b86]">Ethereum</p>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(prices.eth)}
        </p>
      </div>
    </div>
  );
}
