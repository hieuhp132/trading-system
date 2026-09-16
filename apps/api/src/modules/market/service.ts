import type { MarketPriceResponse } from "./types";
import { DemoMarketDataProvider } from "./providers/demo-market-data-provider";
import type { MarketDataProvider } from "./providers/market-data-provider";

const provider: MarketDataProvider = new DemoMarketDataProvider();

export async function getMarketPrice(
  symbol: string,
): Promise<MarketPriceResponse> {
  return provider.getPrice(symbol);
}
