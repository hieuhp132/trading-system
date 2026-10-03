import {
  getMarketFreshnessDisplayState,
  type MarketFreshnessDisplayState,
} from "../src/features/market/marketFreshnessDisplayState.js";

import type {
  MarketFreshnessEvent,
} from "../src/features/market/stream.js";

let passed = 0;

function assertEqual<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function test(
  name: string,
  run: () => void,
): void {
  run();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

function freshness(
  status: MarketFreshnessEvent["status"],
  ageMs: number | null,
): MarketFreshnessEvent {
  return {
    symbol: "XAUUSD",
    status,
    ageMs,
  };
}

function state(
  connected: boolean,
  event: MarketFreshnessEvent | null,
): MarketFreshnessDisplayState {
  return getMarketFreshnessDisplayState({
    connected,
    freshness: event,
  });
}

test(
  "connected + FRESH -> LIVE",
  () => {
    assertEqual(
      state(
        true,
        freshness("FRESH", 250),
      ),
      "LIVE",
      "fresh market state",
    );
  },
);

test(
  "connected + STALE -> STALE",
  () => {
    assertEqual(
      state(
        true,
        freshness("STALE", 5001),
      ),
      "STALE",
      "stale market state",
    );
  },
);

test(
  "connected + MISSING -> WAITING",
  () => {
    assertEqual(
      state(
        true,
        freshness("MISSING", null),
      ),
      "WAITING",
      "missing market state",
    );
  },
);

test(
  "connected + null freshness -> WAITING",
  () => {
    assertEqual(
      state(true, null),
      "WAITING",
      "initial market state",
    );
  },
);

test(
  "disconnected + FRESH -> DISCONNECTED",
  () => {
    assertEqual(
      state(
        false,
        freshness("FRESH", 100),
      ),
      "DISCONNECTED",
      "transport state",
    );
  },
);

test(
  "disconnected + STALE -> DISCONNECTED",
  () => {
    assertEqual(
      state(
        false,
        freshness("STALE", 6000),
      ),
      "DISCONNECTED",
      "transport state",
    );
  },
);

test(
  "disconnected + MISSING -> DISCONNECTED",
  () => {
    assertEqual(
      state(
        false,
        freshness("MISSING", null),
      ),
      "DISCONNECTED",
      "transport state",
    );
  },
);

test(
  "disconnected + null freshness -> DISCONNECTED",
  () => {
    assertEqual(
      state(false, null),
      "DISCONNECTED",
      "transport state",
    );
  },
);

console.log("");
console.log(
  `[PASS] Market Freshness Display State: ${passed}/8 tests`,
);
