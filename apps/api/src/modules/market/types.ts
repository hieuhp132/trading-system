export interface MarketPriceResponse {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  source: string;
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

export interface MarketCandlesMetadata {
  receivedAt: string;
  sourceTimestamp: string | null;
  latestCandleTime: number | null;
}

export interface MarketCandlesResponse {
  symbol: string;
  interval: CandleInterval;
  source: string;
  items: MarketCandle[];
  metadata?: MarketCandlesMetadata;
}
