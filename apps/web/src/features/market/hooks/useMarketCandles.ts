import { useQuery } from "@tanstack/react-query";

import { getMarketCandles, type CandleInterval } from "../api";

interface UseMarketCandlesOptions {
  symbol?: string;
  interval?: CandleInterval;
  limit?: number;
}

export function useMarketCandles({
  symbol = "XAUUSD",
  interval = "1m",
  limit = 100,
}: UseMarketCandlesOptions = {}) {
  return useQuery({
    queryKey: ["market", "candles", symbol, interval, limit],

    queryFn: () => getMarketCandles(symbol, interval, limit),

    refetchInterval: 5000,

    staleTime: 3000,
  });
}
