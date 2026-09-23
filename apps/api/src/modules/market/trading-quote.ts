import {
  assertExecutableQuote,
  type ExecutionQuote,
  type ReferenceQuote,
} from "./quote-contract.js";

export const MAX_TRADING_QUOTE_AGE_MS = 5_000;

export class TradingQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingQuoteError";
  }
}

export function validateTradingQuote(
  quote: ReferenceQuote,
  maxAgeMs = MAX_TRADING_QUOTE_AGE_MS,
  now = Date.now(),
): asserts quote is ExecutionQuote {
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

  try {
    assertExecutableQuote(quote);
  } catch {
    throw new TradingQuoteError(
      "Invalid or non-executable trading quote",
    );
  }

  /*
   * Current PAPER execution freshness is measured from receivedAt.
   *
   * receivedAt means our backend receipt/construction time.
   * It must NOT be interpreted as a trustworthy upstream source
   * timestamp.
   *
   * A future LIVE execution provider requires an explicit source
   * trust policy before LIVE execution is enabled.
   */
  const receivedAt = Date.parse(
    quote.receivedAt,
  );

  if (
    !Number.isFinite(receivedAt) ||
    receivedAt > now + 1_000 ||
    now - receivedAt > maxAgeMs
  ) {
    throw new TradingQuoteError(
      "Trading quote is stale or has an invalid receipt timestamp",
    );
  }
}
