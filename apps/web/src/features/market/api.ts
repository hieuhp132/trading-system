import { api } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

export interface MarketPrice {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  source: "demo" | "twelve-data";
  timestamp: string;
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h";

export interface MarketCandle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface MarketCandles {
  symbol: string;
  interval: CandleInterval;
  source: "demo" | "twelve-data";
  items: MarketCandle[];
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
