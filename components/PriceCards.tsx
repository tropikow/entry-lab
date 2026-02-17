'use client';

import { useLivePrice } from '@/contexts/LivePriceContext';
import { isPredictionAlert, usePredictionAlert } from '@/contexts/PredictionAlertContext';

function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function PriceCards() {
  const { btc, eth, connected, error } = useLivePrice();
  const alertContext = usePredictionAlert();
  const alertBtc = alertContext ? isPredictionAlert(alertContext.btc, btc) : false;
  const alertEth = alertContext ? isPredictionAlert(alertContext.eth, eth) : false;

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

  const alertRing = 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0b0e14] shadow-lg shadow-amber-500/20';
  const normalRing = 'ring-1 ring-[#334155]';

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className={`rounded-lg bg-[#131722] px-5 py-4 shadow-lg transition-all ${alertBtc ? alertRing : normalRing}`}
        title={alertBtc ? 'La IA sugiere revisar el gráfico: objetivo cercano y alta confianza' : undefined}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#787b86]">Bitcoin</p>
          {connected && (
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" title="Precio en vivo" />
          )}
          {alertBtc && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400" title="Revisa el gráfico">
              Alert
            </span>
          )}
        </div>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(btc)}
        </p>
      </div>
      <div
        className={`rounded-lg bg-[#131722] px-5 py-4 shadow-lg transition-all ${alertEth ? alertRing : normalRing}`}
        title={alertEth ? 'La IA sugiere revisar el gráfico: objetivo cercano y alta confianza' : undefined}
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[#787b86]">Ethereum</p>
          {connected && (
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" title="Precio en vivo" />
          )}
          {alertEth && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400" title="Revisa el gráfico">
              Alert
            </span>
          )}
        </div>
        <p className="text-2xl font-semibold text-[#d1d4dc]">
          ${formatPrice(eth)}
        </p>
      </div>
    </div>
  );
}
