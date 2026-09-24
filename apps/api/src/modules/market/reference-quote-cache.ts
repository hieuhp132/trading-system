import {
  validateReferenceQuote,
} from "./quote-contract.js";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

export interface ReferenceQuoteCacheEntry {
  quote: ReferenceQuote;
  cachedAt: string;
}

export class ReferenceQuoteCache {
  private readonly entries =
    new Map<string, ReferenceQuoteCacheEntry>();

  set(
    quote: ReferenceQuote,
    cachedAt = new Date().toISOString(),
  ): void {
    validateReferenceQuote(quote);

    if (!Number.isFinite(Date.parse(cachedAt))) {
      throw new Error(
        "cachedAt must be a valid timestamp",
      );
    }

    const symbol =
      this.normalizeSymbol(quote.symbol);

    const canonicalQuote: ReferenceQuote = {
      symbol,
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
      source: quote.source,
      sourceTimestamp: quote.sourceTimestamp,
      receivedAt: quote.receivedAt,
      bidAskType: quote.bidAskType,
      executionCapability:
        quote.executionCapability,
    };

    this.entries.set(symbol, {
      quote: canonicalQuote,
      cachedAt,
    });
  }

  get(
    symbol: string,
  ): ReferenceQuoteCacheEntry | null {
    const entry =
      this.entries.get(
        this.normalizeSymbol(symbol),
      );

    if (!entry) {
      return null;
    }

    return {
      quote: { ...entry.quote },
      cachedAt: entry.cachedAt,
    };
  }

  delete(symbol: string): boolean {
    return this.entries.delete(
      this.normalizeSymbol(symbol),
    );
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private normalizeSymbol(
    symbol: string,
  ): string {
    const normalized =
      symbol.trim().toUpperCase();

    if (!normalized) {
      throw new Error(
        "symbol must not be empty",
      );
    }

    return normalized;
  }
}
