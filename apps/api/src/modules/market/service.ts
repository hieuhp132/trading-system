import { randomUUID } from "node:crypto";
import { toReferenceQuote } from "./quote-adapter.js";
import { ReferenceQuoteCache } from "./reference-quote-cache.js";
import { createReferenceQuoteFeed } from "./reference-quote-feed.js";
import {
  isExecutableQuote,
  type ExecutionQuote,
  type ReferenceQuote,
} from "./quote-contract.js";
import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketPriceResponse,
} from "./types.js";

import { TwelveDataProvider } from "./providers/twelve-data-provider.js";
import type { MarketDataProvider } from "./providers/market-data-provider.js";
import {
  TradingQuoteError,
  validateTradingQuote,
} from "./trading-quote.js";
import { AppError } from "../../common/errors/app-error.js";
import { db } from "../../database/prisma.js";
import { SharedMarketCache } from "./shared-market-cache.js";
import {
  isMarketClosedByWeekend,
  isMarketClosedError,
  markMarketClosedConfirmed,
} from "./market-hours.js";

import { DemoMarketDataProvider } from "./providers/demo-market-data-provider.js";
import { applyQuoteToCandle } from "./quote-candle.js";
import {
  CANDLE_INTERVAL_SECONDS,
} from "./candle-aggregation.js";
import {
  MAX_MARKET_CANDLE_LIMIT,
  resolveMarketCandleLimit,
} from "./candle-limits.js";

function createMarketDataProvider(): MarketDataProvider {
  const provider =
    process.env.MARKET_DATA_PROVIDER?.trim().toLowerCase() ?? "twelve-data";

  switch (provider) {
    case "twelve-data":
      return new TwelveDataProvider();
    case "demo":
      return new DemoMarketDataProvider();

    default:
      throw new Error(
        `MARKET_DATA_PROVIDER không hợp lệ: ${provider}. ` +
          `Giá trị hỗ trợ: twelve-data, demo`,
      );
  }
}

const provider = createMarketDataProvider();
const sharedMarketCache = new SharedMarketCache({
  priceTtlMs: 15_000,
  candleTtlMs: 60_000,
});

const referenceQuoteCache = new ReferenceQuoteCache();

let lastKnownPrice: MarketPriceResponse | null = null;

function quoteReceivedAtMs(
  quote: { timestamp?: string; receivedAt?: string } | null | undefined,
): number {
  if (!quote) {
    return Number.NEGATIVE_INFINITY;
  }

  const raw = quote.receivedAt ?? quote.timestamp;
  if (!raw) {
    return Number.NEGATIVE_INFINITY;
  }

  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

function pickFreshestMarketPrice(
  ...candidates: Array<MarketPriceResponse | null | undefined>
): MarketPriceResponse | null {
  let newest: MarketPriceResponse | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const ms = quoteReceivedAtMs(candidate);
    if (ms >= newestMs) {
      newest = candidate;
      newestMs = ms;
    }
  }

  return newest;
}

function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

async function persistMarketPriceSnapshot(
  symbol: string,
  price: MarketPriceResponse,
): Promise<void> {
  try {
    await db.orm.public.MarketPrice.create({
      symbol,
      bid: String(price.bid),
      ask: String(price.ask),
      last: String(price.last),
      source: price.source ?? "twelve-data",
      timestamp: new Date(price.timestamp).toISOString(),
    });
  } catch (error) {
    console.warn(
      "[market-history] failed to persist latest market price",
      error,
    );
  }
}

const persistedQuoteTimestampBySymbol = new Map<string, string>();
const quoteCandleWriteBySymbol = new Map<string, Promise<void>>();

async function persistQuoteAsIntervalCandles(
  quote: ReferenceQuote,
): Promise<void> {
  const previousWrite = quoteCandleWriteBySymbol.get(quote.symbol);
  if (previousWrite) {
    await previousWrite;
  }

  if (persistedQuoteTimestampBySymbol.get(quote.symbol) === quote.receivedAt) {
    return;
  }

  const write = (async () => {
    const price = Number(quote.last);
    const timestampMs = Date.parse(quote.receivedAt);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestampMs)) {
      return;
    }

    const plans = (Object.keys(
      CANDLE_INTERVAL_SECONDS,
    ) as CandleInterval[]).map((interval) => {
      const bucketSeconds = CANDLE_INTERVAL_SECONDS[interval];
      const bucketTime = Math.floor(timestampMs / (bucketSeconds * 1000)) * bucketSeconds;
      const candleTime = new Date(bucketTime * 1000).toISOString();
      const candle = applyQuoteToCandle(null, bucketTime, price);

      return db.raw.sql`
        INSERT INTO "public"."marketCandle" (
          "id", "symbol", "interval", "time", "open", "high", "low", "close", "source", "receivedAt"
        ) VALUES (
          ${randomUUID()}, ${quote.symbol}, ${interval}, ${candleTime},
          ${candle.open}, ${candle.high}, ${candle.low}, ${candle.close},
          ${quote.source}, ${quote.receivedAt}
        )
        ON CONFLICT ("symbol", "interval", "time") DO UPDATE SET
          "high" = GREATEST("marketCandle"."high", EXCLUDED."high"),
          "low" = LEAST("marketCandle"."low", EXCLUDED."low"),
          "close" = EXCLUDED."close",
          "source" = EXCLUDED."source",
          "receivedAt" = EXCLUDED."receivedAt"
        WHERE "marketCandle"."receivedAt" <= EXCLUDED."receivedAt"
        RETURNING "id"
      `
        .returnsRow({ id: { codecId: "pg/text@1" } })
        .build();
    });

    await db.transaction(async (tx) => {
      for (const plan of plans) {
        await tx.query(plan);
      }
    });

    persistedQuoteTimestampBySymbol.set(quote.symbol, quote.receivedAt);
    for (const interval of Object.keys(
      CANDLE_INTERVAL_SECONDS,
    ) as CandleInterval[]) {
      sharedMarketCache.invalidateCandles(quote.symbol, interval);
    }
  })();

  quoteCandleWriteBySymbol.set(quote.symbol, write);
  try {
    await write;
  } catch (error) {
    console.warn("[market-candles] failed to persist quote candle", {
      symbol: quote.symbol,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (quoteCandleWriteBySymbol.get(quote.symbol) === write) {
      quoteCandleWriteBySymbol.delete(quote.symbol);
    }
  }
}

async function getPersistedLatestMarketPrice(
  symbol: string,
): Promise<MarketPriceResponse | null> {
  try {
    const plan = db.raw.sql`
      SELECT "symbol", "bid", "ask", "last", "source", "timestamp"
      FROM "public"."marketPrice"
      WHERE "symbol" = ${symbol}
      ORDER BY "timestamp" DESC
      LIMIT 1
    `
      .returnsRow({
        symbol: { codecId: "pg/text@1" },
        bid: { codecId: "pg/numeric@1" },
        ask: { codecId: "pg/numeric@1" },
        last: { codecId: "pg/numeric@1" },
        source: { codecId: "pg/text@1", nullable: true },
        timestamp: { codecId: "pg/timestamptz-string@1" },
      })
      .build();

    const rows = await db.transaction((tx) => tx.query(plan));
    if (rows.length === 0) {
      return null;
    }

    const latest = rows[0];
    return {
      symbol: latest.symbol,
      bid: String(latest.bid),
      ask: String(latest.ask),
      last: String(latest.last),
      source: (latest.source ?? "twelve-data") as "demo" | "twelve-data",
      timestamp: new Date(latest.timestamp).toISOString(),
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.info(
        "[market-history] marketPrice table not found; skipping persisted latest price",
      );
      return null;
    }

    console.warn("[market-history] failed to read latest market price", error);
    return null;
  }
}

interface PersistedCandleRow {
  symbol: string;
  interval: string;
  time: string;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  source: string | null;
}

function toMarketCandles(
  symbol: string,
  interval: CandleInterval,
  rows: PersistedCandleRow[],
  limit: number,
): MarketCandlesResponse | null {
  if (rows.length === 0) return null;

  const byTime = new Map<number, PersistedCandleRow>();
  for (const row of rows) {
    byTime.set(Math.floor(Date.parse(row.time) / 1000), row);
  }
  const bounded = [...byTime.entries()]
    .sort(([left], [right]) => left - right)
    .slice(-limit);
  const items = bounded.map(([time, row]) => ({
    time,
    open: String(row.open),
    high: String(row.high),
    low: String(row.low),
    close: String(row.close),
  }));

  return {
    symbol,
    interval,
    source:
      bounded[bounded.length - 1]?.[1].source === "GETDATA"
        ? "historical-full"
        : bounded[bounded.length - 1]?.[1].source ?? "historical-full",
    items,
  };
}

async function queryPersistedCandleRows(
  symbol: string,
  interval: CandleInterval,
  limit: number,
  fullHistory: boolean,
): Promise<PersistedCandleRow[]> {
  const plan = fullHistory
    ? db.raw.sql`
        SELECT "symbol", "interval", "time", "open", "high", "low", "close", "source"
        FROM "public"."historicalMarketCandleFull"
        WHERE "symbol" = ${symbol} AND "interval" = '1m'
        ORDER BY "time" DESC
        LIMIT ${limit}
      `.returnsRow({
        symbol: { codecId: "pg/text@1" },
        interval: { codecId: "pg/text@1" },
        time: { codecId: "pg/timestamptz-string@1" },
        open: { codecId: "pg/numeric@1" },
        high: { codecId: "pg/numeric@1" },
        low: { codecId: "pg/numeric@1" },
        close: { codecId: "pg/numeric@1" },
        source: { codecId: "pg/text@1", nullable: true },
      }).build()
    : db.raw.sql`
        SELECT "symbol", "interval", "time", "open", "high", "low", "close", "source"
        FROM "public"."marketCandle"
        WHERE "symbol" = ${symbol} AND "interval" = ${interval}
        ORDER BY "time" DESC
        LIMIT ${limit}
      `.returnsRow({
        symbol: { codecId: "pg/text@1" },
        interval: { codecId: "pg/text@1" },
        time: { codecId: "pg/timestamptz-string@1" },
        open: { codecId: "pg/numeric@1" },
        high: { codecId: "pg/numeric@1" },
        low: { codecId: "pg/numeric@1" },
        close: { codecId: "pg/numeric@1" },
        source: { codecId: "pg/text@1", nullable: true },
      }).build();

  return await db.transaction((tx) => tx.query(plan));
}

async function getPersistedCandles(
  symbol: string,
  interval: CandleInterval,
  limit = 100,
): Promise<MarketCandlesResponse | null> {
  try {
    if (interval !== "1m") {
      const rows = await queryPersistedCandleRows(symbol, interval, limit, false);
      return toMarketCandles(symbol, interval, rows.reverse(), limit);
    }

    const [historyRows, liveRows] = await Promise.all([
      queryPersistedCandleRows(symbol, interval, limit, true),
      queryPersistedCandleRows(symbol, interval, limit, false),
    ]);
    const mergedRows = new Map<number, PersistedCandleRow>();
    for (const row of historyRows) {
      mergedRows.set(Math.floor(Date.parse(row.time) / 1000), row);
    }
    for (const row of liveRows) {
      mergedRows.set(Math.floor(Date.parse(row.time) / 1000), row);
    }

    return toMarketCandles(
      symbol,
      interval,
      [...mergedRows.values()],
      limit,
    );
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.info("[market-history] candle history table not found");
      return null;
    }

    console.warn("[market-history] failed to read persisted candles", error);
    return null;
  }
}

export { aggregateCandlesToInterval } from "./candle-aggregation.js";

/**
 * Fail closed until the active provider supplies a verifiable source quote.
 * Must run before database writes or external price requests.
 */
export function assertTradingExecutionAllowed(): void {
  const providerKey = process.env.TWELVE_DATA_API_KEY?.trim();

  if (
    provider instanceof TwelveDataProvider &&
    (!providerKey || providerKey.length === 0)
  ) {
    throw new AppError(
      "Không thể xác minh thời điểm cập nhật giá Twelve Data tại nguồn",
      503,
      "TRADING_QUOTE_UNVERIFIED",
    );
  }
}

export function resolveHistoricalCandleLimit(interval: CandleInterval): number {
  return resolveMarketCandleLimit(interval);
}

export async function ensureMarketHistoryWarmup(
  symbol = "XAUUSD",
  _intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"],
): Promise<void> {
  const persistedPrice = await getPersistedLatestMarketPrice(symbol);

  if (!persistedPrice) {
    const freshPrice = await provider.getPrice(symbol);
    lastKnownPrice = freshPrice;
    await persistMarketPriceSnapshot(symbol, freshPrice);
  } else {
    lastKnownPrice = persistedPrice;
  }

  const persistedCandles = await getPersistedCandles(
    symbol,
    "1m",
    resolveHistoricalCandleLimit("1m"),
  );

  if (persistedCandles && persistedCandles.items.length > 0) {
    return;
  }

  console.info(
    `[market-history] no persisted ${symbol} 1m candles; skipping provider candle request to preserve credits`,
  );
}

async function buildFallbackPriceFromLatestCandle(
  symbol: string,
): Promise<MarketPriceResponse | null> {
  try {
    const latestCandles = await getPersistedCandles(symbol, "1m", 1);
    if (!latestCandles || latestCandles.items.length === 0) {
      return null;
    }
    const lastCandle = latestCandles.items[latestCandles.items.length - 1];
    const lastClose = Number(lastCandle.close);
    if (!Number.isFinite(lastClose)) {
      return null;
    }
    const spreadCents = Math.max(0.1, lastClose * 0.00005);
    const bid = lastClose - spreadCents;
    const ask = lastClose + spreadCents;
    const synthetic: MarketPriceResponse & {
      metadata?: {
        receivedAt: string;
        sourceTimestamp: string;
        bidAskType: string;
        executable: boolean;
      };
    } = {
      symbol,
      bid: bid.toFixed(2),
      ask: ask.toFixed(2),
      last: lastClose.toFixed(2),
      source: latestCandles.source,
      timestamp: new Date(lastCandle.time * 1000).toISOString(),
      metadata: {
        receivedAt: new Date().toISOString(),
        sourceTimestamp: new Date(lastCandle.time * 1000).toISOString(),
        bidAskType: "SYNTHETIC",
        executable: false,
      },
    };
    return synthetic;
  } catch {
    return null;
  }
}

async function getStalePriceFallback(
  symbol: string,
): Promise<MarketPriceResponse | null> {
  const persisted = await getPersistedLatestMarketPrice(symbol);
  const newest = pickFreshestMarketPrice(lastKnownPrice, persisted);

  if (newest) {
    return newest;
  }

  return await buildFallbackPriceFromLatestCandle(symbol);
}

export async function getMarketPrice(
  symbol: string,
): Promise<MarketPriceResponse> {
  if (isMarketClosedByWeekend()) {
    const persistedPrice = await getPersistedLatestMarketPrice(symbol);
    if (persistedPrice) {
      lastKnownPrice = persistedPrice;
      return persistedPrice;
    }

    if (lastKnownPrice) {
      return lastKnownPrice;
    }

    const hydratedPrice = await provider.getPrice(symbol);
    lastKnownPrice = hydratedPrice;
    await persistMarketPriceSnapshot(symbol, hydratedPrice);
    return hydratedPrice;
  }

  try {
    const price = await sharedMarketCache.getOrCreatePrice(symbol, async () => {
      const fresh = await provider.getPrice(symbol);
      lastKnownPrice = fresh;
      await persistMarketPriceSnapshot(symbol, fresh);
      return fresh;
    });

    lastKnownPrice = price;
    return price;
  } catch (providerError) {
    const fallback = await getStalePriceFallback(symbol);
    if (fallback) {
      logPriceFallbackOncePerWindow(symbol, providerError, fallback);
      if (quoteReceivedAtMs(fallback) >= quoteReceivedAtMs(lastKnownPrice)) {
        lastKnownPrice = fallback;
      }
      return fallback;
    }
    throw providerError;
  }
}

async function fetchReferenceQuote(symbol: string): Promise<ReferenceQuote> {
  const legacyPrice = await getMarketPrice(symbol);

  const adapted = toReferenceQuote(legacyPrice);

  /*
   * Keep the reference boundary structurally pure.
   * The demo adapter may carry the transitional
   * ExecutionQuote `timestamp`; do not propagate it.
   */
  const quote: ReferenceQuote = {
    symbol: adapted.symbol,
    bid: adapted.bid,
    ask: adapted.ask,
    last: adapted.last,
    source: adapted.source,
    sourceTimestamp: adapted.sourceTimestamp,
    receivedAt: adapted.receivedAt,
    bidAskType: adapted.bidAskType,
    executionCapability: adapted.executionCapability,
  };

  await persistQuoteAsIntervalCandles(quote);
  return quote;
}

const referenceQuoteFeed = createReferenceQuoteFeed(
  {
    fetchQuote: fetchReferenceQuote,
    cache: referenceQuoteCache,
    onError(error) {
      if (isMarketClosedError(error)) {
        markMarketClosedConfirmed();
        return;
      }

      console.error("[market-reference-feed] refresh failed", error);
    },
  },
  {
    symbol: "XAUUSD",
    intervalMs: 500,
  },
);

function finalizeCandles(
  data: MarketCandlesResponse,
  limit: number,
  symbol: string,
  interval: CandleInterval,
): MarketCandlesResponse {
  const sliced =
    data.items.length > limit
      ? { ...data, items: data.items.slice(-limit) }
      : data;
  const key = `${symbol}:${interval}`;
  const cache = sharedMarketCache as any;
  cache.candleEntries?.set(key, {
    value: sliced,
    expiresAt: Date.now() + 60_000,
  });
  (async () => {
    try {
      await cache.setRedisCandles?.(key, sliced, 60_000);
    } catch {
      // Redis unavailable; ignore non-critical write
    }
  })();
  return sliced;
}

const CANDLE_WARMUP_SCHEDULE = Object.keys(
  CANDLE_INTERVAL_SECONDS,
) as CandleInterval[];

setInterval(async () => {
  for (const interval of CANDLE_WARMUP_SCHEDULE) {
    try {
      await getMarketCandles(
        "XAUUSD",
        interval,
        resolveMarketCandleLimit(interval),
      );
    } catch {}
  }
  const now = new Date().toISOString();
  console.debug(`[market-cron] background candle warmup completed at ${now}`);
}, 59_000);

export async function getReferenceQuote(
  symbol: string,
): Promise<ReferenceQuote> {
  const quote = await fetchReferenceQuote(symbol);

  referenceQuoteCache.set(quote);

  return quote;
}

export function getReferenceQuoteFeed() {
  return referenceQuoteFeed;
}

export function getCachedReferenceQuote(symbol: string): ReferenceQuote | null {
  return referenceQuoteCache.get(symbol)?.quote ?? null;
}

function toLegacyPriceFromReference(
  quote: ReferenceQuote,
): MarketPriceResponse {
  return {
    symbol: quote.symbol,
    bid: quote.bid,
    ask: quote.ask,
    last: quote.last,
    source: quote.source as MarketPriceResponse["source"],
    timestamp: quote.receivedAt,
  };
}

export async function getTradingQuote(symbol: string): Promise<ExecutionQuote> {
  /*
   * Keep the existing provider-level fail-closed guard during
   * migration. Twelve Data must still be rejected before a price
   * request is attempted.
   */
  assertTradingExecutionAllowed();

  const cachedReference = getCachedReferenceQuote(symbol);
  const legacyPrice = await getMarketPrice(symbol);
  const freshest = pickFreshestMarketPrice(
    lastKnownPrice,
    legacyPrice,
    cachedReference ? toLegacyPriceFromReference(cachedReference) : null,
  );

  if (!freshest) {
    throw new AppError(
      "Không lấy được giá giao dịch hợp lệ.",
      503,
      "TRADING_QUOTE_UNAVAILABLE",
    );
  }

  const quote = toReferenceQuote(freshest);

  if (!isExecutableQuote(quote)) {
    throw new AppError(
      "Không lấy được giá giao dịch hợp lệ.",
      503,
      "TRADING_QUOTE_UNAVAILABLE",
    );
  }

  try {
    validateTradingQuote(quote);
    return quote;
  } catch (error) {
    if (error instanceof TradingQuoteError) {
      throw new AppError(
        "Giá thị trường quá cũ để đặt lệnh hoặc chỉnh SL/TP. Vui lòng thử lại khi dữ liệu còn mới.",
        503,
        "TRADING_QUOTE_STALE",
      );
    }

    throw error;
  }
}

const priceFallbackWarnLog = new Map<string, number>();

function logPriceFallbackOncePerWindow(
  symbol: string,
  providerError: unknown,
  fallback: MarketPriceResponse,
): void {
  const nowMs = Date.now();
  const cooldownMs = 60_000;
  const lastAt = priceFallbackWarnLog.get(symbol) ?? 0;
  if (nowMs - lastAt < cooldownMs) {
    return;
  }
  priceFallbackWarnLog.set(symbol, nowMs);
  console.warn("[market-price] upstream unavailable; serving stale fallback", {
    symbol,
    error:
      providerError instanceof Error
        ? providerError.message
        : String(providerError),
    fallbackSource: fallback.source,
    fallbackTimestamp: fallback.timestamp,
  });
}

export async function getMarketCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number,
): Promise<MarketCandlesResponse> {
  const configuredLimit = resolveMarketCandleLimit(interval);
  const responseLimit = Math.min(limit, configuredLimit);

  if (responseLimit < 1) {
    throw new AppError(
      "Candle limit phải lớn hơn 0.",
      400,
      "INVALID_CANDLE_LIMIT",
    );
  }

  const cache = sharedMarketCache as any;
  const key = `${symbol}:${interval}`;
  const cached = cache.candleEntries?.get(key);
  if (
    cached?.expiresAt > Date.now() &&
    cached.value?.items?.length >= responseLimit
  ) {
    return finalizeCandles(
      cached.value as MarketCandlesResponse,
      responseLimit,
      symbol,
      interval,
    );
  }

  const candles = await getPersistedCandles(
    symbol,
    interval,
    responseLimit,
  );

  if (!candles?.items.length) {
    throw new AppError(
      "Không lấy được dữ liệu nến cho timeframe này.",
      502,
      "MARKET_CANDLES_UNAVAILABLE",
    );
  }

  return finalizeCandles(candles, responseLimit, symbol, interval);
}
