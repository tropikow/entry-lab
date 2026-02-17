import { NextRequest, NextResponse } from 'next/server';

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = 604800;
const SECONDS_PER_MONTH = 2592000; // ~30 days

async function fetchKlines(symbol: string, interval: string, limit: number) {
  const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Binance klines fetch failed');
  const raw: [number, string, string, string, string, string, number, ...unknown[]][] = await res.json();
  return raw.map(([openTime, open, high, low, close]) => ({
    time: Math.floor(openTime / 1000),
    open: parseFloat(open),
    high: parseFloat(high),
    low: parseFloat(low),
    close: parseFloat(close),
  }));
}

function intervalToSeconds(interval: string): number {
  if (interval === '1d') return SECONDS_PER_DAY;
  if (interval === '1w') return SECONDS_PER_WEEK;
  if (interval === '1M') return SECONDS_PER_MONTH;
  return SECONDS_PER_DAY;
}

function intervalLabel(interval: string): string {
  if (interval === '1d') return 'diario';
  if (interval === '1w') return 'semanal';
  if (interval === '1M') return 'mensual';
  return 'diario';
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY no configurada. Añade la variable en .env.local' },
      { status: 500 }
    );
  }

  let body: {
    symbol: string;
    interval: string;
    userEntries?: {
      price: number;
      side: string;
      amount?: number;
      createdAt?: number;
      outcome: 'won' | 'lost' | null;
      pnl?: number | null;
    }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { symbol = 'BTCUSDT', interval = '1d', userEntries = [] } = body;
  const validSymbols = ['BTCUSDT', 'ETHUSDT'];
  if (!validSymbols.includes(symbol)) {
    return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 });
  }

  const asset = symbol === 'BTCUSDT' ? 'Bitcoin (BTC)' : 'Ethereum (ETH)';
  const intervalStr = intervalLabel(interval);

  try {
    const klines = await fetchKlines(symbol, interval, 90);
    const lastPrices = klines.slice(-30).map((k) => k.close);
    const lastCandle = klines[klines.length - 1];
    const periodSeconds = intervalToSeconds(interval);

    const entriesContext =
      userEntries.length > 0
        ? `

HISTORIAL DEL USUARIO (aprende de sus movimientos para mejorar tu análisis):
El usuario tiene ${userEntries.length} entradas registradas. Cada entrada incluye cuándo se realizó (fecha/hora) y el resultado:
${userEntries
  .map((e, i) => {
    const fecha = e.createdAt
      ? new Date(e.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
      : 'fecha desconocida';
    const qty = e.amount && e.amount > 0 ? `, cantidad ${e.amount}` : '';
    const pnl = e.pnl != null ? `, P&L ${e.pnl >= 0 ? '+' : ''}${e.pnl.toFixed(2)} USDT` : '';
    return `- Entrada ${i + 1}: ${e.side === 'buy' ? 'Compró (long)' : 'Vendió (short)'} a $${e.price}${qty} el ${fecha}. Resultado: ${e.outcome === 'won' ? 'GANÓ' : e.outcome === 'lost' ? 'PERDIÓ' : 'neutral'}${pnl}`;
  })
  .join('\n')}
Considera estos movimientos del usuario al predecir: patrones donde acertó o falló, zonas de precio frecuentes, etc.`
        : '';

    const prompt = `Eres un analista técnico de criptomonedas. Analiza el siguiente historial de precios de cierre de ${asset} en gráfico ${intervalStr}.
Últimos 30 precios de cierre (del más antiguo al más reciente): ${lastPrices.join(', ')}
Precio actual: ${lastCandle.close}
Rango último período: high ${lastCandle.high}, low ${lastCandle.low}
${entriesContext}

Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con esta estructura exacta:
{
  "targetPrice": <número: precio objetivo para el próximo período>,
  "direction": "up" | "down" | "sideways",
  "confidence": "low" | "medium" | "high",
  "reasoning": "<breve explicación en español, máximo 2 frases>",
  "predictedValues": [<valor1>, <valor2>, <valor3>, <valor4>, <valor5>]
}

Donde predictedValues son 5 precios estimados para los próximos 5 períodos (para dibujar una línea de tendencia).
targetPrice representa el punto más probable al que llegará el precio en el corto plazo.
Sé conciso y fundamenta en patrones técnicos.
${userEntries.length > 0 ? 'Incluye en tu reasoning una breve mención de cómo el historial del usuario influye en tu predicción.' : ''}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error('OpenAI error:', err);
      return NextResponse.json(
        { error: 'Error al llamar a la IA' },
        { status: 502 }
      );
    }

    const json = await openaiRes.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Respuesta vacía de la IA' }, { status: 502 });
    }

    const parsed = JSON.parse(content) as {
      targetPrice: number;
      direction: string;
      confidence: string;
      reasoning: string;
      predictedValues?: number[];
    };

    const lastTime = lastCandle.time;
    const predictedLine =
      parsed.predictedValues?.map((value, i) => ({
        time: lastTime + (i + 1) * periodSeconds,
        value,
      })) ?? [];

    return NextResponse.json({
      targetPrice: parsed.targetPrice,
      direction: parsed.direction,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      predictedLine,
      currentPrice: lastCandle.close,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al predecir' },
      { status: 502 }
    );
  }
}
