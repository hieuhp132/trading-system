import type {
  ReferenceQuote,
} from "./quote-contract.js";

import type {
  ReferenceQuoteCache,
} from "./reference-quote-cache.js";

export interface ReferenceQuoteFeedOptions {
  symbol: string;
  intervalMs: number;
}

export interface ReferenceQuoteFeedDependencies {
  fetchQuote(
    symbol: string,
  ): Promise<ReferenceQuote>;

  cache: ReferenceQuoteCache;

  onError?(error: unknown): void;
}

export interface ReferenceQuoteFeed {
  refresh(): Promise<ReferenceQuote>;
  start(): void;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createReferenceQuoteFeed(
  dependencies: ReferenceQuoteFeedDependencies,
  options: ReferenceQuoteFeedOptions,
): ReferenceQuoteFeed {
  const symbol =
    options.symbol.trim().toUpperCase();

  if (!symbol) {
    throw new Error(
      "Reference quote feed symbol must not be empty",
    );
  }

  if (
    !Number.isSafeInteger(options.intervalMs) ||
    options.intervalMs < 100
  ) {
    throw new Error(
      "Reference quote feed intervalMs must be an integer >= 100",
    );
  }

  let timer:
    | ReturnType<typeof setInterval>
    | null = null;

  let activeRefresh:
    | Promise<ReferenceQuote>
    | null = null;

  async function refresh(): Promise<ReferenceQuote> {
    /*
     * Deduplicate concurrent refresh attempts.
     * One feed instance must never create overlapping
     * provider requests for the same symbol.
     */
    if (activeRefresh) {
      return activeRefresh;
    }

    const request = (async () => {
      const quote =
        await dependencies.fetchQuote(symbol);

      dependencies.cache.set(quote);

      return quote;
    })();

    activeRefresh = request;

    try {
      return await request;
    } finally {
      if (activeRefresh === request) {
        activeRefresh = null;
      }
    }
  }

  function start(): void {
    if (timer) {
      return;
    }

    timer = setInterval(() => {
      void refresh().catch((error: unknown) => {
        dependencies.onError?.(error);
      });
    }, options.intervalMs);
  }

  async function stop(): Promise<void> {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    /*
     * Graceful shutdown:
     * wait for an already-running provider request.
     */
    const pending = activeRefresh;

    if (pending) {
      await pending.then(
        () => undefined,
        () => undefined,
      );
    }
  }

  function isRunning(): boolean {
    return timer !== null;
  }

  return {
    refresh,
    start,
    stop,
    isRunning,
  };
}
