'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type AlertData = { targetPrice: number; confidence: string } | null;

type PredictionAlertState = {
  btc: AlertData;
  eth: AlertData;
  setPredictionAlert: (symbol: 'BTC' | 'ETH', data: AlertData) => void;
};

const PredictionAlertContext = createContext<PredictionAlertState | null>(null);

const THRESHOLD_PCT = 0.03; // 3%: objetivo "cerca" del precio actual

export function isPredictionAlert(
  data: AlertData,
  currentPrice: number
): boolean {
  if (!data || !currentPrice || currentPrice <= 0) return false;
  if (data.confidence !== 'high') return false;
  const diffPct = Math.abs(data.targetPrice - currentPrice) / currentPrice;
  return diffPct <= THRESHOLD_PCT;
}

export function PredictionAlertProvider({ children }: { children: ReactNode }) {
  const [btc, setBtc] = useState<AlertData>(null);
  const [eth, setEth] = useState<AlertData>(null);

  const setPredictionAlert = useCallback((symbol: 'BTC' | 'ETH', data: AlertData) => {
    if (symbol === 'BTC') setBtc(data);
    else setEth(data);
  }, []);

  return (
    <PredictionAlertContext.Provider value={{ btc, eth, setPredictionAlert }}>
      {children}
    </PredictionAlertContext.Provider>
  );
}

export function usePredictionAlert() {
  return useContext(PredictionAlertContext);
}
