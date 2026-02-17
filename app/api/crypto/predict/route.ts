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

  const { symbol = 'BTCUSDT', userEntries = [] } = body;
  const validSymbols = ['BTCUSDT', 'ETHUSDT'];
  if (!validSymbols.includes(symbol)) {
    return NextResponse.json({ error: 'Símbolo inválido' }, { status: 400 });
  }

  const asset = symbol === 'BTCUSDT' ? 'Bitcoin (BTC)' : 'Ethereum (ETH)';
  const interval = '1M'; // La IA siempre analiza en tiempo mensual
  const periodSeconds = intervalToSeconds(interval);

  try {
    const klines = await fetchKlines(symbol, interval, 60);
    const lastCandle = klines[klines.length - 1];
    const closes = klines.map((k) => k.close);
    const highs = klines.map((k) => k.high);
    const lows = klines.map((k) => k.low);

    function ema(data: number[], period: number): number[] {
      const k = 2 / (period + 1);
      const result: number[] = [];
      let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      for (let i = 0; i < period - 1; i++) result.push(NaN);
      result.push(prev);
      for (let i = period; i < data.length; i++) {
        prev = data[i] * k + prev * (1 - k);
        result.push(prev);
      }
      return result;
    }
    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);
    const ema50 = ema(closes, 50);
    const lastEma9 = ema9.filter((n) => !Number.isNaN(n)).pop();
    const lastEma21 = ema21.filter((n) => !Number.isNaN(n)).pop();
    const lastEma50 = ema50.filter((n) => !Number.isNaN(n)).pop();

    const recentHigh = Math.max(...highs.slice(-12));
    const recentLow = Math.min(...lows.slice(-12));
    const range = recentHigh - recentLow;
    const fib236 = recentHigh - range * 0.236;
    const fib382 = recentHigh - range * 0.382;
    const fib5 = recentHigh - range * 0.5;
    const fib618 = recentHigh - range * 0.618;
    const fib786 = recentHigh - range * 0.786;

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

    const prompt = `Eres un analista técnico experto en criptomonedas. SIEMPRE trabajas en tiempo MENSUAL para captar movimientos estructurales y recurrentes del mercado.

## Datos de ${asset} (velas mensuales, últimos 60 meses)
Precios de cierre (del más antiguo al más reciente): ${closes.join(', ')}
Precio actual (último cierre): ${lastCandle.close}
Última vela: open ${lastCandle.open}, high ${lastCandle.high}, low ${lastCandle.low}, close ${lastCandle.close}

## Indicadores calculados (mensual)
- **EMAs**: EMA(9) = ${lastEma9?.toFixed(2) ?? 'N/A'}, EMA(21) = ${lastEma21?.toFixed(2) ?? 'N/A'}, EMA(50) = ${lastEma50?.toFixed(2) ?? 'N/A'}
- **Fibonacci (últimos 12 meses)**: Rango ${recentLow.toFixed(2)} - ${recentHigh.toFixed(2)}
  - 23.6%: ${fib236.toFixed(2)} | 38.2%: ${fib382.toFixed(2)} | 50%: ${fib5.toFixed(2)} | 61.8%: ${fib618.toFixed(2)} | 78.6%: ${fib786.toFixed(2)}

Debes considerar en tu análisis: retrocesos de Fibonacci como soporte/resistencia, cruces y distancia a EMAs (9, 21, 50), patrones recurrentes mensuales, estructura de máximos y mínimos, y el contexto de que el mercado suele repetir ciclos. Deduce el potencial del próximo movimiento mensual.
${entriesContext}

Responde ÚNICAMENTE con un JSON válido, sin texto adicional. Debes dar AMBAS opciones (compra y venta); el usuario verá como recomendación principal la que tenga mayor confianza:
{
  "buySuggestion": {
    "targetPrice": <número: precio sugerido para ENTRAR EN COMPRA (long)>,
    "confidence": "low" | "medium" | "high"
  },
  "sellSuggestion": {
    "targetPrice": <número: precio sugerido para ENTRAR EN VENTA (short)>,
    "confidence": "low" | "medium" | "high"
  },
  "reasoning": "<explicación breve en español citando Fibonacci, EMA o patrones recurrentes>",
  "predictedValues": [<valor1>, <valor2>, <valor3>, <valor4>, <valor5>]
}

predictedValues = 5 precios estimados para los próximos 5 MESES (trayectoria más probable).
Indica en buySuggestion y sellSuggestion la confianza real de cada operación; la de mayor confianza se mostrará al usuario como recomendación principal.`;

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
      buySuggestion?: { targetPrice: number; confidence: string };
      sellSuggestion?: { targetPrice: number; confidence: string };
      reasoning?: string;
      predictedValues?: number[];
    };

    const buy = parsed.buySuggestion ?? { targetPrice: lastCandle.close, confidence: 'low' };
    const sell = parsed.sellSuggestion ?? { targetPrice: lastCandle.close, confidence: 'low' };
    const confLevel = (c: string) => (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
    const buyConf = confLevel(buy.confidence);
    const sellConf = confLevel(sell.confidence);
    const recommendedSide = buyConf >= sellConf ? 'buy' : 'sell';
    const recommended = recommendedSide === 'buy' ? buy : sell;
    const alternative = recommendedSide === 'buy' ? sell : buy;

    const lastTime = lastCandle.time;
    const predictedLine =
      parsed.predictedValues?.map((value, i) => ({
        time: lastTime + (i + 1) * periodSeconds,
        value,
      })) ?? [];

    return NextResponse.json({
      targetPrice: recommended.targetPrice,
      direction: recommendedSide === 'buy' ? 'up' : 'down',
      confidence: recommended.confidence,
      reasoning: parsed.reasoning ?? '',
      predictedLine,
      currentPrice: lastCandle.close,
      recommendedSide,
      alternativeSuggestion: {
        side: (recommendedSide === 'buy' ? 'sell' : 'buy') as 'buy' | 'sell',
        targetPrice: alternative.targetPrice,
        confidence: alternative.confidence,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al predecir' },
      { status: 502 }
    );
  }
}
