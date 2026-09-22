import type { MarketPriceResponse } from "./types.js";

export const MAX_TRADING_QUOTE_AGE_MS = 5_000;

export class TradingQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingQuoteError";
  }
}

export function validateTradingQuote(
  quote: MarketPriceResponse,
  maxAgeMs = MAX_TRADING_QUOTE_AGE_MS,
  now = Date.now(),
): void {
  if (
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs < 1
  ) {
    throw new TradingQuoteError(
      "Invalid trading quote age configuration",
    );
  }

  if (quote.symbol !== "XAUUSD") {
    throw new TradingQuoteError(
      "Invalid trading quote symbol",
    );
  }

  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const last = Number(quote.last);

  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    !Number.isFinite(last) ||
    bid <= 0 ||
    ask <= 0 ||
    last <= 0 ||
    bid > ask
  ) {
    throw new TradingQuoteError(
      "Invalid trading quote prices",
    );
  }

  const timestamp = Date.parse(quote.timestamp);

  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 1_000 ||
    now - timestamp > maxAgeMs
  ) {
    throw new TradingQuoteError(
      "Trading quote is stale or has an invalid timestamp",
    );
  }
}