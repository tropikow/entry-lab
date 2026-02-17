'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useLivePrice } from '@/contexts/LivePriceContext';
import {
  createChart,
  LineSeries,
  CandlestickSeries,
  createSeriesMarkers,
  LineStyle,
  type UTCTimestamp,
  type SeriesMarker,
} from 'lightweight-charts';

type ChartPoint = { time: UTCTimestamp; value: number };

type CandleData = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Entry = {
  id: string;
  price: number;
  side: 'buy' | 'sell';
  /** Cantidad de BTC o ETH comprados/vendidos */
  amount: number;
  /** Timestamp en ms (Date.now()) de cuándo se realizó la entrada */
  createdAt: number;
};

const STORAGE_KEY = 'entry-lab-entries';

function loadEntriesFromStorage(symbol: string): Entry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${symbol}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is Entry =>
          e != null &&
          typeof e === 'object' &&
          typeof (e as Entry).id === 'string' &&
          typeof (e as Entry).price === 'number' &&
          ((e as Entry).side === 'buy' || (e as Entry).side === 'sell')
      )
      .map((e) => ({
        ...e,
        amount: typeof (e as Entry).amount === 'number' && (e as Entry).amount > 0 ? (e as Entry).amount : 0,
        createdAt: typeof (e as Entry).createdAt === 'number' ? (e as Entry).createdAt : Date.now(),
      })) as Entry[];
  } catch {
    return [];
  }
}

function saveEntriesToStorage(symbol: string, entries: Entry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY}-${symbol}`, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function computeOutcome(entry: Entry, currentPrice: number): 'won' | 'lost' | null {
  if (!currentPrice || currentPrice <= 0) return null;
  const diff = currentPrice - entry.price;
  if (Math.abs(diff) / entry.price < 0.0001) return null; // neutral
  if (entry.side === 'buy') return diff > 0 ? 'won' : 'lost';
  return diff < 0 ? 'won' : 'lost'; // sell/short: profit when price goes down
}

/** P&L en USDT: positivo = ganancia, negativo = pérdida */
function computePnL(entry: Entry, currentPrice: number): number | null {
  if (!currentPrice || currentPrice <= 0 || !entry.amount || entry.amount <= 0) return null;
  if (entry.side === 'buy') return (currentPrice - entry.price) * entry.amount;
  return (entry.price - currentPrice) * entry.amount; // short
}

export type ChartInterval = '1d' | '1w' | '1M';

export type Prediction = {
  targetPrice: number;
  direction: string;
  confidence: string;
  reasoning: string;
  predictedLine: ChartPoint[];
  currentPrice: number;
};

type Props = {
  symbol: 'BTCUSDT' | 'ETHUSDT';
  color?: string;
  interval?: ChartInterval;
};

function findClosestTimeForTimestamp(data: CandleData[], timestampMs: number): UTCTimestamp {
  if (data.length === 0) return 0 as UTCTimestamp;
  const ts = Math.floor(timestampMs / 1000);
  let best = data[0];
  let bestDiff = Math.abs(best.time - ts);
  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(data[i].time - ts);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = data[i];
    }
  }
  return best.time;
}

function formatEntryDate(createdAt: number): string {
  const d = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - createdAt;
  if (diffMs < 60000) return 'Hace un momento';
  if (diffMs < 3600000) return `Hace ${Math.floor(diffMs / 60000)} min`;
  if (diffMs < 86400000) return `Hace ${Math.floor(diffMs / 3600000)} h`;
  if (diffMs < 604800000) return `Hace ${Math.floor(diffMs / 86400000)} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export default function ChartComponent({ symbol, color = '#2962ff', interval = '1d' }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const markersPluginRef = useRef<{ setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void } | null>(null);
  const [data, setData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>(() =>
    typeof window !== 'undefined' ? loadEntriesFromStorage(symbol) : []
  );
  const { btc, eth } = useLivePrice();
  const currentPrice = symbol === 'BTCUSDT' ? btc : eth;
  const [priceInput, setPriceInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [sideInput, setSideInput] = useState<'buy' | 'sell'>('buy');
  const [dateInput, setDateInput] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  });
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const parsePriceInput = useCallback((raw: string): number | null => {
    const s = raw.replace(/,/g, '.').trim().toLowerCase();
    const match = s.match(/^([\d.]+)\s*(k)?\s*$/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    return match[2] === 'k' ? num * 1000 : num;
  }, []);

  const parseAmountInput = useCallback((raw: string): number | null => {
    const s = raw.replace(/,/g, '.').trim().toLowerCase();
    const match = s.match(/^([\d.]+)\s*(k|m)?\s*$/);
    if (!match) return null;
    const num = parseFloat(match[1]);
    if (!Number.isFinite(num) || num <= 0) return null;
    const suffix = match[2];
    if (suffix === 'k') return num * 1000;
    if (suffix === 'm') return num * 1_000_000;
    return num;
  }, []);

  const addEntry = useCallback(() => {
    const p = parsePriceInput(priceInput);
    if (p == null) return;
    const amount = parseAmountInput(amountInput) ?? 0;
    const createdAt = dateInput ? new Date(dateInput).getTime() : Date.now();
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), price: p, side: sideInput, amount, createdAt },
    ]);
    setPriceInput('');
    setAmountInput('');
    setDateInput(new Date().toISOString().slice(0, 16));
  }, [priceInput, amountInput, sideInput, dateInput, parsePriceInput, parseAmountInput]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  // Guardar entradas en localStorage cuando cambien
  useEffect(() => {
    saveEntriesToStorage(symbol, entries);
  }, [entries, symbol]);

  const fetchPrediction = useCallback(async () => {
    setPredictLoading(true);
    setPredictError(null);
    const userEntries = entries.map((e) => ({
      price: e.price,
      side: e.side,
      amount: e.amount,
      createdAt: e.createdAt,
      outcome: computeOutcome(e, currentPrice),
      pnl: computePnL(e, currentPrice),
    }));
    try {
      const res = await fetch('/api/crypto/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, interval, userEntries }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al predecir');
      setPrediction(json);
    } catch (e) {
      setPredictError(e instanceof Error ? e.message : 'Error al predecir');
    } finally {
      setPredictLoading(false);
    }
  }, [symbol, interval, entries, currentPrice]);

  const clearPrediction = useCallback(() => {
    setPrediction(null);
    setPredictError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/crypto/klines?symbol=${symbol}&interval=${interval}&limit=190`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load chart data');
        return res.json();
      })
      .then((d: { time: number; open: number; high: number; low: number; close: number }[]) => {
        if (!cancelled) setData(d as CandleData[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Error loading data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  // Crear chart con datos y predicción (línea IA)
  useEffect(() => {
    if (!chartContainerRef.current || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(data);
    markersPluginRef.current = createSeriesMarkers(candleSeries, []);

    // Línea de predicción IA: conecta último cierre con la trayectoria predicha
    if (prediction?.predictedLine?.length) {
      const lastCandle = data[data.length - 1];
      const predictionLineData: ChartPoint[] = [
        { time: lastCandle.time, value: lastCandle.close },
        ...prediction.predictedLine.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      ];
      const predSeries = chart.addSeries(LineSeries, {
        color: prediction.direction === 'up' ? '#22c55e' : prediction.direction === 'down' ? '#ef4444' : '#a78bfa',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
      });
      predSeries.setData(predictionLineData);
    }

    chart.timeScale().fitContent();

    return () => {
      markersPluginRef.current = null;
      chart.remove();
    };
  }, [data, color, prediction]);

  // Actualizar marcadores: entradas + predicción IA
  useEffect(() => {
    if (!markersPluginRef.current || data.length === 0) return;

    const markers: SeriesMarker<UTCTimestamp>[] = [
      ...entries.map((e) => ({
        time: findClosestTimeForTimestamp(data, e.createdAt),
        position: 'atPriceMiddle' as const,
        price: e.price,
        shape: e.side === 'buy' ? 'arrowUp' as const : 'arrowDown' as const,
        color: e.side === 'buy' ? '#22c55e' : '#ef4444',
        text: `${e.price >= 1000 ? (e.price / 1000).toFixed(1) + 'k' : e.price} ${e.side === 'buy' ? 'Compra' : 'Venta'}`,
      })),
      ...(prediction
        ? [
            {
              time: (prediction.predictedLine.length > 0
                ? prediction.predictedLine[prediction.predictedLine.length - 1].time
                : data[data.length - 1].time) as UTCTimestamp,
              position: 'atPriceMiddle' as const,
              price: prediction.targetPrice,
              shape: 'circle' as const,
              color: '#06b6d4',
              text: `IA: ${prediction.targetPrice >= 1000 ? (prediction.targetPrice / 1000).toFixed(1) + 'k' : prediction.targetPrice.toFixed(2)}`,
            },
          ]
        : []),
    ];
    markersPluginRef.current.setMarkers(markers);
  }, [entries, data, prediction]);

  if (error) {
    return (
      <div className="w-full rounded-lg bg-[#131722] p-4 text-red-400">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg bg-[#131722] text-[#d1d4dc]">
        Cargando gráfico…
      </div>
    );
  }

  const formatPrice = (p: number) =>
    p >= 1000 ? `${(p / 1000).toFixed(1)}k` : p.toFixed(2);

  return (
    <div className="w-full space-y-4">
      <div className="rounded-lg bg-[#131722] p-4 ring-1 ring-[#334155]">
        <p className="mb-3 text-sm font-medium text-[#787b86]">Añadir entrada</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#787b86]">Precio (USDT)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="ej. 70000 o 3.5k"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEntry()}
              className="w-36 rounded border border-[#334155] bg-[#1e222d] px-3 py-2 text-[#d1d4dc] placeholder:text-[#787b86] focus:border-[#2962ff] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#787b86]">
              Cantidad ({symbol === 'BTCUSDT' ? 'BTC' : 'ETH'})
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="ej. 0.001 o 0.5"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addEntry()}
              className="w-32 rounded border border-[#334155] bg-[#1e222d] px-3 py-2 text-[#d1d4dc] placeholder:text-[#787b86] focus:border-[#2962ff] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#787b86]">Fecha y hora</span>
            <input
              type="datetime-local"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              className="rounded border border-[#334155] bg-[#1e222d] px-3 py-2 text-[#d1d4dc] focus:border-[#2962ff] focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#787b86]">Lado</span>
            <select
              value={sideInput}
              onChange={(e) => setSideInput(e.target.value as 'buy' | 'sell')}
              className="rounded border border-[#334155] bg-[#1e222d] px-3 py-2 text-[#d1d4dc] focus:border-[#2962ff] focus:outline-none"
            >
              <option value="buy">Comprador (long)</option>
              <option value="sell">Vendedor (short)</option>
            </select>
          </label>
          <button
            type="button"
            onClick={addEntry}
            className="rounded bg-[#2962ff] px-4 py-2 text-sm font-medium text-white hover:bg-[#1e53e5]"
          >
            Añadir entrada
          </button>
          <button
            type="button"
            onClick={fetchPrediction}
            disabled={predictLoading}
            className="rounded bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-50"
          >
            {predictLoading ? 'Analizando…' : 'Predecir con IA'}
          </button>
        </div>
      </div>

      {predictError && (
        <div className="rounded-lg bg-[#131722] p-4 ring-1 ring-red-500/50 text-red-400 text-sm">
          {predictError}
        </div>
      )}

      {prediction && (
        <div className="rounded-lg bg-[#131722] p-4 ring-1 ring-[#334155]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-[#06b6d4]">Predicción IA (GPT-4o)</p>
            <button
              type="button"
              onClick={clearPrediction}
              className="rounded p-1 text-[#787b86] hover:bg-[#334155] hover:text-[#d1d4dc]"
              aria-label="Quitar predicción"
            >
              ×
            </button>
          </div>
          <p className="mb-2 text-sm text-[#d1d4dc]">{prediction.reasoning}</p>
          <div className="flex flex-wrap gap-2 text-xs text-[#787b86]">
            <span>Objetivo: <strong className="text-[#06b6d4]">${formatPrice(prediction.targetPrice)}</strong></span>
            <span>Dirección: <strong>{prediction.direction === 'up' ? '↑ Alcista' : prediction.direction === 'down' ? '↓ Bajista' : '→ Lateral'}</strong></span>
            <span>Confianza: <strong>{prediction.confidence}</strong></span>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="rounded-lg bg-[#131722] p-4 ring-1 ring-[#334155]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[#787b86]">Mis entradas</p>
            {(() => {
              const won = entries.filter((e) => computeOutcome(e, currentPrice) === 'won').length;
              const lost = entries.filter((e) => computeOutcome(e, currentPrice) === 'lost').length;
              const total = won + lost;
              const totalPnL = entries.reduce((sum, e) => {
                const pnl = computePnL(e, currentPrice);
                return sum + (pnl ?? 0);
              }, 0);
              const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
              return (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-[#22c55e]">{won} ganadoras</span>
                  <span className="text-[#ef4444]">{lost} perdedoras</span>
                  {total > 0 && <strong className="text-[#d1d4dc]">{winRate}% acierto</strong>}
                  {totalPnL !== 0 && (
                    <span
                      className={
                        totalPnL > 0
                          ? 'font-semibold text-[#22c55e]'
                          : 'font-semibold text-[#ef4444]'
                      }
                    >
                      P&L total: {totalPnL > 0 ? '+' : ''}
                      {totalPnL >= 1000
                        ? `${(totalPnL / 1000).toFixed(1)}k`
                        : totalPnL.toFixed(2)}{' '}
                      USDT
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
          <ul className="flex flex-wrap gap-2">
            {entries.map((e) => {
              const outcome = computeOutcome(e, currentPrice);
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-2 rounded bg-[#1e222d] px-3 py-1.5 text-sm"
                >
                  <span
                    className={
                      e.side === 'buy' ? 'text-[#22c55e]' : 'text-[#ef4444]'
                    }
                  >
                    {e.side === 'buy' ? '↑' : '↓'}
                  </span>
                  <span className="text-[#d1d4dc]">
                    ${formatPrice(e.price)} {e.side === 'buy' ? 'Compra' : 'Venta'}
                  </span>
                  <span className="text-xs text-[#787b86]" title={new Date(e.createdAt).toLocaleString('es')}>
                    {formatEntryDate(e.createdAt)}
                  </span>
                  {outcome === 'won' && (
                    <span className="rounded bg-[#22c55e]/20 px-1.5 py-0.5 text-xs text-[#22c55e]">
                      Ganó
                    </span>
                  )}
                  {outcome === 'lost' && (
                    <span className="rounded bg-[#ef4444]/20 px-1.5 py-0.5 text-xs text-[#ef4444]">
                      Perdió
                    </span>
                  )}
                  {outcome === null && currentPrice > 0 && (
                    <span className="rounded bg-[#787b86]/20 px-1.5 py-0.5 text-xs text-[#787b86]">
                      En punto
                    </span>
                  )}
                  {e.amount > 0 && (() => {
                    const pnl = computePnL(e, currentPrice);
                    if (pnl == null) return null;
                    return (
                      <span
                        className={
                          pnl >= 0
                            ? 'rounded bg-[#22c55e]/20 px-1.5 py-0.5 text-xs text-[#22c55e]'
                            : 'rounded bg-[#ef4444]/20 px-1.5 py-0.5 text-xs text-[#ef4444]'
                        }
                        title={`${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT`}
                      >
                        {pnl >= 0 ? '+' : ''}
                        {Math.abs(pnl) >= 1000 ? `${(pnl / 1000).toFixed(1)}k` : pnl.toFixed(2)} $
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => removeEntry(e.id)}
                    className="ml-1 rounded p-0.5 text-[#787b86] hover:bg-[#334155] hover:text-[#d1d4dc]"
                    aria-label="Eliminar entrada"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="w-full">
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  );
}
