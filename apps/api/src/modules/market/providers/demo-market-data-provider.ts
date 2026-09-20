import { AppError } from "../../../common/errors/app-error.js";
import type { MarketDataProvider } from "./market-data-provider.js";
import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketCandle,
  MarketPriceResponse,
} from "../types.js";

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

const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

function roundPrice(value: number): string {
  return value.toFixed(2);
}

function getBasePrice(symbol: string): number {
  const price = DEMO_PRICES[symbol];

  if (!price) {
    throw new AppError(
      `Symbol ${symbol} chưa được hỗ trợ`,
      400,
      "UNSUPPORTED_SYMBOL",
    );
  }

  return Number(price.last);
}

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

  async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number,
  ): Promise<MarketCandlesResponse> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    const basePrice = getBasePrice(normalizedSymbol);
    const intervalSeconds = INTERVAL_SECONDS[interval];

    const now = Math.floor(Date.now() / 1000);

    const currentBucket = Math.floor(now / intervalSeconds) * intervalSeconds;

    const candles: MarketCandle[] = [];

    for (let index = limit - 1; index >= 0; index--) {
      const time = currentBucket - index * intervalSeconds;

      /*
       * Deterministic demo movement.
       *
       * Dữ liệu không random hoàn toàn để mỗi lần polling
       * không làm chart nhảy thành một bộ dữ liệu khác.
       */
      const wave1 = Math.sin(index * 0.35) * 2.8;
      const wave2 = Math.sin(index * 0.11) * 1.5;

      const open = basePrice + wave1 + wave2;

      const close = open + Math.sin(index * 0.73) * 1.2;

      const high =
        Math.max(open, close) + 0.4 + Math.abs(Math.sin(index * 0.41)) * 1.2;

      const low =
        Math.min(open, close) - 0.4 - Math.abs(Math.cos(index * 0.37)) * 1.1;

      candles.push({
        time,
        open: roundPrice(open),
        high: roundPrice(high),
        low: roundPrice(low),
        close: roundPrice(close),
      });
    }

    /*
     * Candle cuối cùng bám theo giá demo hiện tại.
     * Điều này giúp chart kết nối hợp lý với quote.
     */
    const currentPrice = basePrice;

    const lastCandle = candles[candles.length - 1];

    if (lastCandle) {
      const open = Number(lastCandle.open);

      lastCandle.close = roundPrice(currentPrice);
      lastCandle.high = roundPrice(
        Math.max(Number(lastCandle.high), open, currentPrice),
      );
      lastCandle.low = roundPrice(
        Math.min(Number(lastCandle.low), open, currentPrice),
      );
    }

    return {
      symbol: normalizedSymbol,
      interval,
      source: "demo",
      items: candles,
    };
  }
}
