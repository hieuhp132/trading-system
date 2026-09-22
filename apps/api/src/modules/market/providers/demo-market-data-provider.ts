import { AppError } from "../../../common/errors/app-error.js";
import type { MarketDataProvider } from "./market-data-provider.js";
import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketCandle,
  MarketPriceResponse,
} from "../types.js";
import { readFile } from "node:fs/promises";

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
async function getSmokeTestPrice(
  symbol: string,
): Promise<{ bid: string; ask: string; last: string } | null> {
  const filePath = process.env.DEMO_PRICE_FILE;

  if (!filePath) {
    return null;
  }

  // The override must never be active outside the test environment.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase() !== "demo"
  ) {
    throw new Error(
      "DEMO_PRICE_FILE requires NODE_ENV=test and MARKET_DATA_PROVIDER=demo",
    );
  }

  const content = await readFile(filePath, "utf8");
  const data: unknown = JSON.parse(content);

  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid demo price file");
  }

  const record = data as Record<string, unknown>;
  const price = record[symbol];

  if (typeof price !== "object" || price === null) {
    throw new Error(`Demo price not found for ${symbol}`);
  }

  const values = price as Record<string, unknown>;

  if (
    typeof values.bid !== "string" ||
    typeof values.ask !== "string" ||
    typeof values.last !== "string"
  ) {
    throw new Error("Demo prices must be strings");
  }

  const bid = Number(values.bid);
  const ask = Number(values.ask);
  const last = Number(values.last);

  if (
    ![bid, ask, last].every(Number.isFinite) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask ||
    last < bid ||
    last > ask ||
    ![values.bid, values.ask, values.last].every((value) =>
      /^\d+\.\d{2}$/.test(value as string),
    )
  ) {
    throw new Error("Invalid demo BID/ASK/LAST");
  }

  return {
    bid: values.bid,
    ask: values.ask,
    last: values.last,
  };
}
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

    const smokeTestPrice = await getSmokeTestPrice(normalizedSymbol);
    const currentPrice = smokeTestPrice ?? price;

    return {
      symbol: normalizedSymbol,
      bid: currentPrice.bid,
      ask: currentPrice.ask,
      last: currentPrice.last,
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
      const bucket = Math.floor(time / intervalSeconds);

      const wave1 = Math.sin(bucket * 0.35) * 2.8;
      const wave2 = Math.sin(bucket * 0.11) * 1.5;

      const open = basePrice + wave1 + wave2;

      const close = open + Math.sin(bucket * 0.73) * 1.2;

      const high =
        Math.max(open, close) + 0.4 + Math.abs(Math.sin(bucket * 0.41)) * 1.2;

      const low =
        Math.min(open, close) - 0.4 - Math.abs(Math.cos(bucket * 0.37)) * 1.1;

      candles.push({
        time,
        open: roundPrice(open),
        high: roundPrice(high),
        low: roundPrice(low),
        close: roundPrice(close),
      });
    }

    return {
      symbol: normalizedSymbol,
      interval,
      source: "demo",
      items: candles,
    };
  }
}
