import { toReferenceQuote } from "./quote-adapter.js";
import {
  ReferenceQuoteCache,
} from "./reference-quote-cache.js";
import {
  createReferenceQuoteFeed,
} from "./reference-quote-feed.js";
import type {
  ExecutionQuote,
  ReferenceQuote,
} from "./quote-contract.js";
import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketPriceResponse,
} from "./types.js";

import { DemoMarketDataProvider } from "./providers/demo-market-data-provider.js";
import { TwelveDataProvider } from "./providers/twelve-data-provider.js";
import type { MarketDataProvider } from "./providers/market-data-provider.js";
import { validateTradingQuote } from "./trading-quote.js";
import { AppError } from "../../common/errors/app-error.js";

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

const referenceQuoteCache =
  new ReferenceQuoteCache();

/**
 * Fail closed until the active provider supplies a verifiable source quote.
 * Must run before database writes or external price requests.
 */
export function assertTradingExecutionAllowed(): void {
  if (provider instanceof TwelveDataProvider) {
    throw new AppError(
      "Không thể xác minh thời điểm cập nhật giá Twelve Data tại nguồn",
      503,
      "TRADING_QUOTE_UNVERIFIED",
    );
  }
}

export async function getMarketPrice(
  symbol: string,
): Promise<MarketPriceResponse> {
  return provider.getPrice(symbol);
}

async function fetchReferenceQuote(
  symbol: string,
): Promise<ReferenceQuote> {
  const legacyPrice =
    await getMarketPrice(symbol);

  const adapted =
    toReferenceQuote(legacyPrice);

  /*
   * Keep the reference boundary structurally pure.
   * The demo adapter may carry the transitional
   * ExecutionQuote `timestamp`; do not propagate it.
   */
  return {
    symbol: adapted.symbol,
    bid: adapted.bid,
    ask: adapted.ask,
    last: adapted.last,
    source: adapted.source,
    sourceTimestamp: adapted.sourceTimestamp,
    receivedAt: adapted.receivedAt,
    bidAskType: adapted.bidAskType,
    executionCapability:
      adapted.executionCapability,
  };
}

const referenceQuoteFeed =
  createReferenceQuoteFeed(
    {
      fetchQuote: fetchReferenceQuote,
      cache: referenceQuoteCache,
      onError(error) {
        console.error(
          "[market-reference-feed] refresh failed",
          error,
        );
      },
    },
    {
      symbol: "XAUUSD",
      intervalMs: 2_000,
    },
  );

export async function getReferenceQuote(
  symbol: string,
): Promise<ReferenceQuote> {
  const quote =
    await fetchReferenceQuote(symbol);

  referenceQuoteCache.set(quote);

  return quote;
}

export function getReferenceQuoteFeed() {
  return referenceQuoteFeed;
}

export function getCachedReferenceQuote(
  symbol: string,
): ReferenceQuote | null {
  return (
    referenceQuoteCache.get(symbol)?.quote ??
    null
  );
}

export async function getTradingQuote(
  symbol: string,
): Promise<ExecutionQuote> {
  /*
   * Keep the existing provider-level fail-closed guard during
   * migration. Twelve Data must still be rejected before a price
   * request is attempted.
   */
  assertTradingExecutionAllowed();

  const legacyPrice = await getMarketPrice(symbol);

  /*
   * Explicit trust boundary:
   *
   * Legacy provider response
   *   -> ReferenceQuote
   *   -> execution validation/narrowing
   *   -> ExecutionQuote
   */
  const quote = toReferenceQuote(
    legacyPrice,
  );

  validateTradingQuote(quote);

  return quote;
}

export async function getMarketCandles(
  symbol: string,
  interval: CandleInterval,
  limit: number,
): Promise<MarketCandlesResponse> {
  return provider.getCandles(symbol, interval, limit);
}
