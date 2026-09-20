import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketPriceResponse,
} from "../types.js";

export interface MarketDataProvider {
  getPrice(symbol: string): Promise<MarketPriceResponse>;

  getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number,
  ): Promise<MarketCandlesResponse>;
}
