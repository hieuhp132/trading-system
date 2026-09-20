import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketPriceResponse,
} from "./types.js";

import { DemoMarketDataProvider } from "./providers/demo-market-data-provider.js";
import { TwelveDataProvider } from "./providers/twelve-data-provider.js";
import type { MarketDataProvider } from "./providers/market-data-provider.js";

function createMarketDataProvider(): MarketDataProvider {
  const provider =
    process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase() ?? "demo";

  switch (provider) {
    case "demo":
      return new DemoMarketDataProvider();

    case "twelve-data":
      return new TwelveDataProvider();

    default:
      throw new Error(
        `MARKET_DATA_PROVIDER không hợp lệ: ${provider}. ` +
          `Giá trị hỗ trợ: demo, twelve-data`,
      );
  }
}

const provider = createMarketDataProvider();

export async function getMarketPrice(
  symbol: string,
): Promise<MarketPriceResponse> {
  return provider.getPrice(symbol);
}

export async function getMarketCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number,
): Promise<MarketCandlesResponse> {
  return provider.getCandles(symbol, interval, limit);
}
