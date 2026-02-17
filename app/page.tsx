'use client';

import { useState } from 'react';
import ChartComponent, { type ChartInterval } from '@/components/ChartComponent';
import PriceCards from '@/components/PriceCards';

export default function Home() {
  const [interval, setChartInterval] = useState<ChartInterval>('1d');

  return (
    <div className="min-h-screen bg-[#0b0e14] p-6 text-[#d1d4dc]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Precios en tiempo real</h1>
        <div className="flex rounded-lg bg-[#131722] p-1 ring-1 ring-[#334155]">
          {(
            [
              { value: '1d' as const, label: 'Día' },
              { value: '1w' as const, label: 'Semana' },
              { value: '1M' as const, label: 'Mes' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setChartInterval(opt.value)}
              className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
                interval === opt.value
                  ? 'bg-[#2962ff] text-white'
                  : 'text-[#787b86] hover:bg-[#1e222d] hover:text-[#d1d4dc]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-8">
        <PriceCards />
      </div>
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 text-lg font-medium text-[#787b86]">Bitcoin (BTC)</h2>
          <ChartComponent symbol="BTCUSDT" color="#f7931a" interval={interval} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium text-[#787b86]">Ethereum (ETH)</h2>
          <ChartComponent symbol="ETHUSDT" color="#627eea" interval={interval} />
        </section>
      </div>
    </div>
  );
}
