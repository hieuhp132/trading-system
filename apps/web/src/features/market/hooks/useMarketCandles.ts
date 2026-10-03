import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getMarketCandles,
  type CandleInterval,
  type MarketCandles,
} from "../api";
import {
  shouldPauseMarketPolling,
} from "../market-hours";

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
  const marketClosed = shouldPauseMarketPolling();
  const queryClient = useQueryClient();
  const queryKey = ["market", "candles", symbol, interval, limit];
  const cachedData = queryClient.getQueryData<MarketCandles>(queryKey);

  const intervalMs = (() => {
    switch (interval) {
      case "1m":
        return 15 * 1000;
      case "5m":
        return 30 * 1000;
      case "15m":
        return 60 * 1000;
      case "1h":
        return 5 * 60 * 1000;
      case "4h":
        return 15 * 60 * 1000;
      case "1d":
        return 60 * 60 * 1000;
      default:
        return 30 * 1000;
    }
  })();

  return useQuery<MarketCandles>({
    queryKey,
    queryFn: async () => {
      const cacheUpdatedAtBeforeRequest =
        queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      const candles = await getMarketCandles(symbol, interval, limit);
      const currentState = queryClient.getQueryState<MarketCandles>(queryKey);

      if (
        currentState?.data &&
        currentState.dataUpdatedAt > cacheUpdatedAtBeforeRequest
      ) {
        return currentState.data;
      }

      return candles;
    },
    enabled: Boolean(symbol),
    staleTime: 5 * 1000,
    gcTime: 2 * 60 * 60_000,
    refetchInterval: marketClosed ? false : intervalMs,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    retryDelay: 500,
    placeholderData: (previous) => previous ?? cachedData,
    initialData: cachedData,
  });
}
