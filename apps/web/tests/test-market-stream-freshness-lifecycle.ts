import {
  getFreshnessAfterStreamOpen,
} from "../src/features/market/marketStreamFreshnessLifecycle.js";

import type {
  MarketFreshnessEvent,
} from "../src/features/market/stream.js";

let passed = 0;

function assertNull(
  value: unknown,
  message: string,
): void {
  if (value !== null) {
    throw new Error(
      `${message}: expected null`,
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

test(
  "stream open invalidates previous FRESH state",
  () => {
    assertNull(
      getFreshnessAfterStreamOpen(
        freshness("FRESH", 100),
      ),
      "FRESH reconnect policy",
    );
  },
);

test(
  "stream open invalidates previous STALE state",
  () => {
    assertNull(
      getFreshnessAfterStreamOpen(
        freshness("STALE", 6000),
      ),
      "STALE reconnect policy",
    );
  },
);

test(
  "stream open invalidates previous MISSING state",
  () => {
    assertNull(
      getFreshnessAfterStreamOpen(
        freshness("MISSING", null),
      ),
      "MISSING reconnect policy",
    );
  },
);

test(
  "initial stream open remains null until snapshot arrives",
  () => {
    assertNull(
      getFreshnessAfterStreamOpen(null),
      "initial reconnect policy",
    );
  },
);

console.log("");
console.log(
  `[PASS] Market Stream Freshness Lifecycle: ${passed}/4 tests`,
);
