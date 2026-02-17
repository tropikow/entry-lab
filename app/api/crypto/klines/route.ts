import { NextRequest, NextResponse } from 'next/server';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

/** Binance kline: [ openTime, open, high, low, close, volume, ... ] */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? 'BTCUSDT';
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 90, 500);
  const interval = request.nextUrl.searchParams.get('interval') ?? '1d';

  const validSymbols = ['BTCUSDT', 'ETHUSDT'];
  if (!validSymbols.includes(symbol)) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
  }

  try {
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error('Binance klines fetch failed');
    const raw: [number, string, string, string, string, string, number, ...unknown[]][] = await res.json();

    const data = raw.map(([openTime, , , , close]) => ({
      time: Math.floor(openTime / 1000),
      value: parseFloat(close),
    }));

    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Failed to fetch klines' },
      { status: 502 }
    );
  }
}
