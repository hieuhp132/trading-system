import { api } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

export interface MarketPrice {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  source: "demo" | "twelve-data";
  timestamp: string;
  metadata: {
    receivedAt: string;
    sourceTimestamp: string | null;
    bidAskType: "REAL" | "SYNTHETIC";
    executable: boolean;
  };
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface MarketCandle {
  time: number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
}

export interface MarketCandlesNumeric {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketCandlesMetadata {
  receivedAt: string;
  sourceTimestamp: string | null;
  latestCandleTime: number | null;
}

export interface MarketCandles {
  symbol: string;
  interval: CandleInterval;
  source: string;
  items: MarketCandle[];
  metadata?: MarketCandlesMetadata;
}

export async function getMarketPrice(symbol = "XAUUSD"): Promise<MarketPrice> {
  const response = await api.get<ApiResponse<MarketPrice>>("/market/price", {
    params: {
      symbol,
    },
  });

  return response.data.data;
}

export async function getMarketCandles(
  symbol = "XAUUSD",
  interval: CandleInterval = "1m",
  limit = 100,
): Promise<MarketCandles> {
  const response = await api.get<ApiResponse<MarketCandles>>(
    "/market/candles",
    {
      params: {
        symbol,
        interval,
        limit,
      },
    },
  );

  return response.data.data;
}
