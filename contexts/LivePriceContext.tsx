'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const BINANCE_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker';

type LivePriceState = {
  btc: number;
  eth: number;
  connected: boolean;
  error: string | null;
};

const initialState: LivePriceState = {
  btc: 0,
  eth: 0,
  connected: false,
  error: null,
};

const LivePriceContext = createContext<LivePriceState | null>(null);

export function LivePriceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LivePriceState>(initialState);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    setState((s) => ({ ...s, error: null }));

    const ws = new WebSocket(BINANCE_WS_URL);

    ws.onopen = () => {
      setState((s) => ({ ...s, connected: true, error: null }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          stream?: string;
          data?: { c?: string };
        };
        const stream = msg.stream ?? '';
        const price = msg.data?.c;
        if (price == null) return;
        const num = parseFloat(price);
        if (!Number.isFinite(num)) return;

        setState((prev) => {
          if (stream.startsWith('btcusdt')) return { ...prev, btc: num };
          if (stream.startsWith('ethusdt')) return { ...prev, eth: num };
          return prev;
        });
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setState((s) => ({
        ...s,
        error: s.error ?? 'Error de conexión',
      }));
    };

    ws.onclose = () => {
      setState((s) => ({ ...s, connected: false }));
      // Reconectar tras 3 segundos
      setTimeout(connect, 3000);
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [connect]);

  return (
    <LivePriceContext.Provider value={state}>
      {children}
    </LivePriceContext.Provider>
  );
}

export function useLivePrice() {
  const ctx = useContext(LivePriceContext);
  if (!ctx) {
    throw new Error('useLivePrice must be used within LivePriceProvider');
  }
  return ctx;
}

/** Hook opcional: devuelve null si no hay provider (para componentes que puedan usarse fuera) */
export function useLivePriceOptional() {
  return useContext(LivePriceContext);
}
