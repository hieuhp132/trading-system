import assert from "node:assert/strict";

import {
  ReferenceQuoteCache,
} from "./reference-quote-cache.js";

import {
  createReferenceQuoteFeed,
} from "./reference-quote-feed.js";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

function quote(
  last = "3651.30",
): ReferenceQuote {
  return {
    symbol: "XAUUSD",
    bid: "3651.20",
    ask: "3651.40",
    last,
    source: "test-reference",
    sourceTimestamp: null,
    receivedAt: new Date().toISOString(),
    bidAskType: "SYNTHETIC",
    executionCapability: "NONE",
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

/*
 * 1. refresh fetches and caches.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let calls = 0;

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote(symbol) {
          calls += 1;

          assert.equal(
            symbol,
            "XAUUSD",
          );

          return quote();
        },
      },
      {
        symbol: "xauusd",
        intervalMs: 100,
      },
    );

  const result =
    await feed.refresh();

  assert.equal(calls, 1);

  assert.deepEqual(
    cache.get("XAUUSD")?.quote,
    result,
  );

  pass("refresh fetches and caches reference quote");
}

/*
 * 2. concurrent refresh is deduplicated.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let calls = 0;
  let release!: () => void;

  const gate =
    new Promise<void>((resolve) => {
      release = resolve;
    });

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          calls += 1;

          await gate;

          return quote();
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  const first =
    feed.refresh();

  const second =
    feed.refresh();

  await Promise.resolve();

  assert.equal(
    calls,
    1,
    "concurrent refresh must share one provider request",
  );

  release();

  const [
    firstQuote,
    secondQuote,
  ] = await Promise.all([
    first,
    second,
  ]);

  assert.deepEqual(
    firstQuote,
    secondQuote,
  );

  assert.equal(calls, 1);

  pass("concurrent refresh is deduplicated");
}

/*
 * 3. start is idempotent.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let calls = 0;

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          calls += 1;

          return quote();
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  assert.equal(
    feed.isRunning(),
    false,
  );

  feed.start();
  feed.start();

  assert.equal(
    feed.isRunning(),
    true,
  );

  await delay(130);

  await feed.stop();

  assert.equal(
    feed.isRunning(),
    false,
  );

  assert.ok(
    calls >= 1,
    "started feed should refresh",
  );

  pass("start is idempotent and stop disables feed");
}

/*
 * 4. stop prevents future scheduled refresh.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let calls = 0;

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          calls += 1;

          return quote();
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  feed.start();

  await delay(130);

  await feed.stop();

  const afterStop =
    calls;

  await delay(150);

  assert.equal(
    calls,
    afterStop,
    "no scheduled refresh may run after stop",
  );

  pass("stop prevents future scheduled refresh");
}

/*
 * 5. stop waits for active refresh.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let release!: () => void;

  const gate =
    new Promise<void>((resolve) => {
      release = resolve;
    });

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          await gate;

          return quote();
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  const refreshing =
    feed.refresh();

  await Promise.resolve();

  let stopped = false;

  const stopping =
    feed.stop().then(() => {
      stopped = true;
    });

  await Promise.resolve();

  assert.equal(
    stopped,
    false,
    "stop must wait for active refresh",
  );

  release();

  await refreshing;
  await stopping;

  assert.equal(stopped, true);

  pass("stop waits for active refresh");
}

/*
 * 6. provider failure is not cached.
 */
{
  const cache =
    new ReferenceQuoteCache();

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          throw new Error(
            "provider unavailable",
          );
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  await assert.rejects(
    feed.refresh(),
    /provider unavailable/,
  );

  assert.equal(
    cache.get("XAUUSD"),
    null,
  );

  pass("failed refresh does not mutate cache");
}

/*
 * 7. scheduled errors reach onError.
 */
{
  const cache =
    new ReferenceQuoteCache();

  let errors = 0;

  const feed =
    createReferenceQuoteFeed(
      {
        cache,

        async fetchQuote() {
          throw new Error(
            "scheduled failure",
          );
        },

        onError() {
          errors += 1;
        },
      },
      {
        symbol: "XAUUSD",
        intervalMs: 100,
      },
    );

  feed.start();

  await delay(130);

  await feed.stop();

  assert.ok(
    errors >= 1,
    "scheduled failure must reach onError",
  );

  pass("scheduled errors are reported");
}

/*
 * 8. invalid symbol fails closed.
 */
{
  assert.throws(
    () =>
      createReferenceQuoteFeed(
        {
          cache:
            new ReferenceQuoteCache(),

          async fetchQuote() {
            return quote();
          },
        },
        {
          symbol: "   ",
          intervalMs: 100,
        },
      ),
    /symbol must not be empty/,
  );

  pass("empty symbol is rejected");
}

/*
 * 9. invalid interval fails closed.
 */
{
  assert.throws(
    () =>
      createReferenceQuoteFeed(
        {
          cache:
            new ReferenceQuoteCache(),

          async fetchQuote() {
            return quote();
          },
        },
        {
          symbol: "XAUUSD",
          intervalMs: 99,
        },
      ),
    /intervalMs must be an integer >= 100/,
  );

  pass("invalid interval is rejected");
}

console.log("");
console.log(
  `[PASS] Reference Quote Feed: ${passed}/9 tests`,
);
