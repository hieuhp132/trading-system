import type { MarketPriceResponse } from "../types";

export interface MarketDataProvider {
  getPrice(symbol: string): Promise<MarketPriceResponse>;
}
