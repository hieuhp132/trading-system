import type {
  ReferenceQuoteFreshnessResult,
} from "./reference-quote-freshness.js";
import type {
  ReferenceQuote,
} from "./quote-contract.js";

export interface ReferenceQuoteHttpPayload {
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  source: string;

  /**
   * Transitional compatibility alias.
   * Canonical reference freshness remains receivedAt.
   */
  timestamp: string;

  metadata: {
    receivedAt: string;
    sourceTimestamp: string | null;
    bidAskType: ReferenceQuote["bidAskType"];
    executable: boolean;
  };
}

export interface ReferenceQuoteSseEvent {
  event: "quote";
  data: ReferenceQuoteHttpPayload;
}

export function toReferenceQuoteHttpPayload(
  quote: ReferenceQuote,
): ReferenceQuoteHttpPayload {
  return {
    symbol: quote.symbol,
    bid: quote.bid,
    ask: quote.ask,
    last: quote.last,
    source: quote.source,
    timestamp: quote.receivedAt,

    metadata: {
      receivedAt: quote.receivedAt,
      sourceTimestamp: quote.sourceTimestamp,
      bidAskType: quote.bidAskType,
      executable:
        quote.executionCapability !== "NONE",
    },
  };
}

export function createReferenceQuoteSseEvent(
  quote: ReferenceQuote,
): ReferenceQuoteSseEvent {
  return {
    event: "quote",
    data: toReferenceQuoteHttpPayload(quote),
  };
}

export function serializeReferenceQuoteSseEvent(
  quote: ReferenceQuote,
): string {
  const message =
    createReferenceQuoteSseEvent(quote);

  return (
    `event: ${message.event}\n` +
    `data: ${JSON.stringify(message.data)}\n\n`
  );
}
export interface ReferenceQuoteFreshnessSsePayload
  extends ReferenceQuoteFreshnessResult {
  symbol: string;
}

export interface ReferenceQuoteFreshnessSseEvent {
  event: "freshness";
  data: ReferenceQuoteFreshnessSsePayload;
}

export function createReferenceQuoteFreshnessSseEvent(
  symbol: string,
  freshness: ReferenceQuoteFreshnessResult,
): ReferenceQuoteFreshnessSseEvent {
  const normalizedSymbol =
    symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    throw new Error(
      "Reference quote freshness symbol must not be empty",
    );
  }

  return {
    event: "freshness",
    data: {
      symbol: normalizedSymbol,
      status: freshness.status,
      ageMs: freshness.ageMs,
    },
  };
}

export function serializeReferenceQuoteFreshnessSseEvent(
  symbol: string,
  freshness: ReferenceQuoteFreshnessResult,
): string {
  const message =
    createReferenceQuoteFreshnessSseEvent(
      symbol,
      freshness,
    );

  return (
    `event: ${message.event}\n` +
    `data: ${JSON.stringify(message.data)}\n\n`
  );
}
