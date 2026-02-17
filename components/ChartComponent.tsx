'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  createChart,
  LineSeries,
  createSeriesMarkers,
  LineStyle,
  type UTCTimestamp,
  type SeriesMarker,
} from 'lightweight-charts';

type ChartPoint = { time: UTCTimestamp; value: number };

export type Entry = {
  id: string;
  price: number;
  side: 'buy' | 'sell';
};

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

function findClosestTimeForPrice(data: ChartPoint[], price: number): UTCTimestamp {
  if (data.length === 0) return 0 as UTCTimestamp;
  let best = data[0];
  let bestDiff = Math.abs(best.value - price);
  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(data[i].value - price);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = data[i];
    }
  }
  return best.time;
}

export default function ChartComponent({ symbol, color = '#2962ff', interval = '1d' }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const markersPluginRef = useRef<{ setMarkers: (m: SeriesMarker<UTCTimestamp>[]) => void } | null>(null);
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [priceInput, setPriceInput] = useState('');
  const [sideInput, setSideInput] = useState<'buy' | 'sell'>('buy');
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

  const addEntry = useCallback(() => {
    const p = parsePriceInput(priceInput);
    if (p == null) return;
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), price: p, side: sideInput },
    ]);
    setPriceInput('');
  }, [priceInput, sideInput, parsePriceInput]);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const fetchPrediction = useCallback(async () => {
    setPredictLoading(true);
    setPredictError(null);
    try {
      const res = await fetch('/api/crypto/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, interval }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Error al predecir');
      setPrediction(json);
    } catch (e) {
      setPredictError(e instanceof Error ? e.message : 'Error al predecir');
    } finally {
      setPredictLoading(false);
    }
  }, [symbol, interval]);

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
      .then((d: { time: number; value: number }[]) => {
        if (!cancelled) setData(d as ChartPoint[]);
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

    const lineSeries = chart.addSeries(LineSeries, { color });
    lineSeries.setData(data);
    markersPluginRef.current = createSeriesMarkers(lineSeries, []);

    // Línea de predicción IA: conecta último punto con la trayectoria predicha
    if (prediction?.predictedLine?.length) {
      const lastPoint = data[data.length - 1];
      const predictionLineData: ChartPoint[] = [
        { time: lastPoint.time, value: lastPoint.value },
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
        time: findClosestTimeForPrice(data, e.price),
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
          <p className="mb-2 text-sm font-medium text-[#787b86]">Mis entradas</p>
          <ul className="flex flex-wrap gap-2">
            {entries.map((e) => (
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
                <button
                  type="button"
                  onClick={() => removeEntry(e.id)}
                  className="ml-1 rounded p-0.5 text-[#787b86] hover:bg-[#334155] hover:text-[#d1d4dc]"
                  aria-label="Eliminar entrada"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="w-full">
        <div ref={chartContainerRef} className="w-full" />
      </div>
    </div>
  );
}
