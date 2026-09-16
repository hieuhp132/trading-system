import { AppError } from "../../../common/errors/app-error";
import type { MarketDataProvider } from "./market-data-provider";
import type { MarketPriceResponse } from "../types";

const DEMO_PRICES: Record<
  string,
  {
    bid: string;
    ask: string;
    last: string;
  }
> = {
  XAUUSD: {
    bid: "3651.20",
    ask: "3651.40",
    last: "3651.30",
  },
};

export class DemoMarketDataProvider implements MarketDataProvider {
  async getPrice(symbol: string): Promise<MarketPriceResponse> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    const price = DEMO_PRICES[normalizedSymbol];

    if (!price) {
      throw new AppError(
        `Symbol ${normalizedSymbol} chưa được hỗ trợ`,
        400,
        "UNSUPPORTED_SYMBOL",
      );
    }

    return {
      symbol: normalizedSymbol,
      bid: price.bid,
      ask: price.ask,
      last: price.last,
      source: "demo",
      timestamp: new Date().toISOString(),
    };
  }
}
