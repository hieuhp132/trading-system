import {
  assertExecutableQuote,
  type ExecutionQuote,
  type ReferenceQuote,
} from "./quote-contract.js";

export class TradingQuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradingQuoteError";
  }
}

export function validateTradingQuote(
  quote: ReferenceQuote,
  now = Date.now(),
): asserts quote is ExecutionQuote {
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
    receivedAt > now + 1_000
  ) {
    throw new TradingQuoteError(
      "Trading quote has an invalid receipt timestamp",
    );
  }
}
