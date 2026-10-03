import assert from "node:assert/strict";

import {
  ReferenceQuoteCache,
} from "./reference-quote-cache.js";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

type TestCase = {
  name: string;
  run: () => void;
};

const receivedAt =
  "2026-09-24T10:00:00.000Z";

const cachedAt =
  "2026-09-24T10:00:01.000Z";

function createQuote(
  overrides: Partial<ReferenceQuote> = {},
): ReferenceQuote {
  return {
    symbol: "XAUUSD",
    bid: "3651.20",
    ask: "3651.40",
    last: "3651.30",
    source: "twelve-data",
    sourceTimestamp: null,
    receivedAt,
    bidAskType: "SYNTHETIC",
    executionCapability: "NONE",
    ...overrides,
  };
}

const tests: TestCase[] = [
  {
    name: "empty cache returns null",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      assert.equal(
        cache.get("XAUUSD"),
        null,
      );

      assert.equal(cache.size(), 0);
    },
  },

  {
    name: "stores and retrieves reference quote",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      const quote = createQuote();

      cache.set(quote, cachedAt);

      assert.deepEqual(
        cache.get("XAUUSD"),
        {
          quote,
          cachedAt,
        },
      );

      assert.equal(cache.size(), 1);
    },
  },

  {
    name: "symbol lookup is normalized",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote({
          symbol: "XAUUSD",
        }),
        cachedAt,
      );

      assert.ok(
        cache.get(" xauusd "),
      );

      assert.equal(cache.size(), 1);
    },
  },

  {
    name: "new quote replaces same symbol",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote({
          last: "3651.30",
        }),
        cachedAt,
      );

      cache.set(
        createQuote({
          bid: "3652.20",
          ask: "3652.40",
          last: "3652.30",
          receivedAt:
            "2026-09-24T10:00:02.000Z",
        }),
        "2026-09-24T10:00:03.000Z",
      );

      const entry =
        cache.get("XAUUSD");

      assert.ok(entry);

      assert.equal(
        entry.quote.last,
        "3652.30",
      );

      assert.equal(
        entry.cachedAt,
        "2026-09-24T10:00:03.000Z",
      );

      assert.equal(cache.size(), 1);
    },
  },

  {
    name: "cache preserves NONE capability",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote({
          executionCapability: "NONE",
        }),
        cachedAt,
      );

      const entry =
        cache.get("XAUUSD");

      assert.ok(entry);

      assert.equal(
        entry.quote.executionCapability,
        "NONE",
      );
    },
  },

  {
    name: "cache does not upgrade PAPER reference quote",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote({
          source: "demo",
          executionCapability: "PAPER",
        }),
        cachedAt,
      );

      const entry =
        cache.get("XAUUSD");

      assert.ok(entry);

      assert.equal(
        entry.quote.executionCapability,
        "PAPER",
      );

      assert.equal(
        "timestamp" in entry.quote,
        false,
        "Reference cache must not manufacture ExecutionQuote compatibility fields",
      );
    },
  },

  {
    name: "returned quote is a defensive copy",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote(),
        cachedAt,
      );

      const first =
        cache.get("XAUUSD");

      assert.ok(first);

      first.quote.last =
        "9999.99";

      const second =
        cache.get("XAUUSD");

      assert.ok(second);

      assert.equal(
        second.quote.last,
        "3651.30",
      );
    },
  },

  {
    name: "input mutation after set does not mutate cache",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      const quote =
        createQuote();

      cache.set(quote, cachedAt);

      quote.last =
        "9999.99";

      const entry =
        cache.get("XAUUSD");

      assert.ok(entry);

      assert.equal(
        entry.quote.last,
        "3651.30",
      );
    },
  },

  {
    name: "cache strips runtime compatibility timestamp",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      const quoteWithRuntimeExtra = {
        ...createQuote(),
        timestamp:
          "2026-09-24T10:00:00.000Z",
      };

      cache.set(
        quoteWithRuntimeExtra,
        cachedAt,
      );

      const entry =
        cache.get("XAUUSD");

      assert.ok(entry);

      assert.equal(
        "timestamp" in entry.quote,
        false,
        "Reference cache must strip runtime-only compatibility fields",
      );

      assert.deepEqual(
        Object.keys(entry.quote).sort(),
        [
          "ask",
          "bid",
          "bidAskType",
          "executionCapability",
          "last",
          "receivedAt",
          "source",
          "sourceTimestamp",
          "symbol",
        ].sort(),
      );
    },
  },
  {
    name: "delete removes one symbol",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote(),
        cachedAt,
      );

      assert.equal(
        cache.delete("xauusd"),
        true,
      );

      assert.equal(
        cache.get("XAUUSD"),
        null,
      );

      assert.equal(cache.size(), 0);
    },
  },

  {
    name: "clear removes all entries",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      cache.set(
        createQuote(),
        cachedAt,
      );

      cache.clear();

      assert.equal(cache.size(), 0);

      assert.equal(
        cache.get("XAUUSD"),
        null,
      );
    },
  },

  {
    name: "invalid reference quote is rejected",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      assert.throws(
        () => {
          cache.set(
            createQuote({
              bid: "4000.00",
              ask: "3000.00",
            }),
            cachedAt,
          );
        },
        /valid prices/,
      );

      assert.equal(cache.size(), 0);
    },
  },

  {
    name: "invalid cachedAt is rejected",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      assert.throws(
        () => {
          cache.set(
            createQuote(),
            "not-a-date",
          );
        },
        /cachedAt must be a valid timestamp/,
      );

      assert.equal(cache.size(), 0);
    },
  },

  {
    name: "empty lookup symbol is rejected",
    run: () => {
      const cache =
        new ReferenceQuoteCache();

      assert.throws(
        () => cache.get("   "),
        /symbol must not be empty/,
      );
    },
  },
];

let passed = 0;

for (const test of tests) {
  try {
    test.run();

    passed += 1;

    console.log(
      `[PASS] ${test.name}`,
    );
  } catch (error) {
    console.error(
      `[FAIL] ${test.name}`,
    );

    throw error;
  }
}

console.log("");
console.log(
  `[PASS] Reference Quote Cache: ${passed}/${tests.length} tests`,
);
