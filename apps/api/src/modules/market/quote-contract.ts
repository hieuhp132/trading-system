export type BidAskType = "REAL" | "SYNTHETIC";

export type ExecutionCapability =
  | "NONE"
  | "PAPER"
  | "LIVE";

export interface ReferenceQuote {
  symbol: string;
  bid: string;
  ask: string;
  last: string;

  source: string;

  /**
   * Timestamp supplied by the upstream source when trustworthy.
   *
   * null means the upstream source did not provide a trustworthy
   * source timestamp for this quote.
   */
  sourceTimestamp: string | null;

  /**
   * Time at which our backend received/constructed this quote.
   *
   * This must never be treated as proof of upstream quote freshness.
   */
  receivedAt: string;

  /**
   * REAL:
   *   BID/ASK came from a source that actually supplied those sides.
   *
   * SYNTHETIC:
   *   BID/ASK were derived locally from another price/reference value.
   */
  bidAskType: BidAskType;

  /**
   * NONE:
   *   Reference/display/valuation only.
   *
   * PAPER:
   *   May be used by the paper-trading execution engine.
   *
   * LIVE:
   *   Reserved for a future verified live execution provider.
   */
  executionCapability: ExecutionCapability;
}

export interface ExecutionQuote extends ReferenceQuote {
  executionCapability: "PAPER" | "LIVE";

  /**
   * @deprecated Transitional compatibility alias for legacy
   * MarketPriceResponse consumers.
   *
   * New execution code must use receivedAt for freshness.
   * Remove this field after legacy execution consumers migrate.
   */
  timestamp: string;
}

export function isExecutableQuote(
  quote: ReferenceQuote,
): quote is ExecutionQuote {
  return quote.executionCapability !== "NONE";
}

export function deriveExecutable(
  quote: ReferenceQuote,
): boolean {
  return isExecutableQuote(quote);
}

export class QuoteContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteContractError";
  }
}

function assertTimestamp(
  value: string,
  field: string,
): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new QuoteContractError(
      `${field} must be a valid timestamp`,
    );
  }
}

export function validateReferenceQuote(
  quote: ReferenceQuote,
): void {
  if (!quote.symbol.trim()) {
    throw new QuoteContractError(
      "symbol must not be empty",
    );
  }

  if (!quote.source.trim()) {
    throw new QuoteContractError(
      "source must not be empty",
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
    throw new QuoteContractError(
      "quote must contain valid prices",
    );
  }

  assertTimestamp(
    quote.receivedAt,
    "receivedAt",
  );

  if (quote.sourceTimestamp !== null) {
    assertTimestamp(
      quote.sourceTimestamp,
      "sourceTimestamp",
    );
  }
}

export function assertExecutableQuote(
  quote: ReferenceQuote,
): asserts quote is ExecutionQuote {
  validateReferenceQuote(quote);

  if (!isExecutableQuote(quote)) {
    throw new QuoteContractError(
      "quote is not executable",
    );
  }

  /*
   * Transitional compatibility invariant:
   *
   * While ExecutionQuote still extends the legacy
   * MarketPriceResponse shape, narrowing to ExecutionQuote must
   * prove that the compatibility timestamp actually exists.
   *
   * receivedAt remains the canonical freshness field.
   */
  const compatibilityTimestamp = (
    quote as ReferenceQuote & {
      timestamp?: unknown;
    }
  ).timestamp;

  if (
    typeof compatibilityTimestamp !== "string" ||
    !Number.isFinite(
      Date.parse(compatibilityTimestamp),
    )
  ) {
    throw new QuoteContractError(
      "executable quote must contain a valid compatibility timestamp",
    );
  }
}
