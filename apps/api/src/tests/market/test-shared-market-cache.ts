import assert from "node:assert/strict";
import test from "node:test";

import { SharedMarketCache } from "./shared-market-cache.js";

const makePrice = (id: string) => ({
  symbol: "XAUUSD",
  bid: `${id}.00`,
  ask: `${id}.20`,
  last: `${id}.10`,
  source: "twelve-data",
  timestamp: new Date().toISOString(),
});

test("shared market cache deduplicates concurrent requests", async () => {
  const cache = new SharedMarketCache({ priceTtlMs: 5000, candleTtlMs: 5000 });

  let calls = 0;
  const promiseA = cache.getOrCreatePrice("XAUUSD", async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return makePrice("1000");
  });

  const promiseB = cache.getOrCreatePrice("XAUUSD", async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return makePrice("2000");
  });

  const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

  assert.equal(calls, 1);
  assert.equal(resultA.last, resultB.last);
  assert.equal(resultA.last, "1000.10");
});

test("shared market cache reuses cached value before TTL expires", async () => {
  const cache = new SharedMarketCache({ priceTtlMs: 5000, candleTtlMs: 5000 });

  const first = await cache.getOrCreatePrice("XAUUSD", async () => makePrice("3000"));
  const second = await cache.getOrCreatePrice("XAUUSD", async () => makePrice("4000"));

  assert.equal(first.last, "3000.10");
  assert.equal(second.last, "3000.10");
});

test("shared market cache invalidation refreshes stale value", async () => {
  const cache = new SharedMarketCache({ priceTtlMs: 5000, candleTtlMs: 5000 });

  const first = await cache.getOrCreatePrice("XAUUSD", async () => makePrice("5000"));
  cache.invalidatePrice("XAUUSD");

  const refreshed = await cache.getOrCreatePrice("XAUUSD", async () => makePrice("6000"));

  assert.equal(first.last, "5000.10");
  assert.equal(refreshed.last, "6000.10");
});
