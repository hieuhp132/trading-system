import type {
  ExecutionQuote,
  ReferenceQuote,
} from "./quote-contract.js";

import type {
  MarketPriceResponse,
} from "./types.js";

export function toReferenceQuote(
  price: MarketPriceResponse,
): ReferenceQuote {
  const source = price.source.trim();

  const referenceQuote: ReferenceQuote = {
    symbol: price.symbol,
    bid: price.bid,
    ask: price.ask,
    last: price.last,
    source: price.source,

    /*
     * Legacy MarketPriceResponse.timestamp represents the time at
     * which our backend produced/received the price object.
     *
     * It is NOT proof of an upstream provider timestamp.
     */
    sourceTimestamp: null,
    receivedAt: price.timestamp,

    /*
     * Both current providers expose BID/ASK generated from local
     * spread logic rather than trustworthy executable market sides.
     */
    bidAskType: "SYNTHETIC",

    /*
     * Start fail-closed. Only explicitly trusted paper execution
     * below may upgrade this reference quote.
     */
    executionCapability: "NONE",
  };

  if (source !== "demo") {
    return referenceQuote;
  }

  /*
   * Explicit paper-execution upgrade.
   *
   * timestamp is a temporary compatibility alias only.
   * receivedAt remains canonical.
   */
  const executionQuote: ExecutionQuote = {
    ...referenceQuote,
    executionCapability: "PAPER",
    timestamp: referenceQuote.receivedAt,
  };

  return executionQuote;
}
