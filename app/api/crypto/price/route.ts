import { NextResponse } from 'next/server';

const BINANCE_BASE = 'https://api.binance.com/api/v3';

export async function GET() {
  try {
    const res = await fetch(
      `${BINANCE_BASE}/ticker/price?symbols=${encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT']))}`,
      { next: { revalidate: 10 } }
    );
    if (!res.ok) throw new Error('Binance price fetch failed');
    const data: { symbol: string; price: string }[] = await res.json();
    const btc = data.find((p) => p.symbol === 'BTCUSDT')?.price ?? '0';
    const eth = data.find((p) => p.symbol === 'ETHUSDT')?.price ?? '0';
    return NextResponse.json({ btc, eth });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 502 }
    );
  }
}
