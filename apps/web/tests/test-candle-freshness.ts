const assert = {
  equal(actual: unknown, expected: unknown): void {
    if (!Object.is(actual, expected)) {
      throw new Error(
        `[FAIL] Expected ${String(expected)}, received ${String(actual)}`,
      );
    }
  },
};

import { getCandleFreshness } from "../src/features/market/candleFreshness";

import type { CandleInterval } from "../src/features/market/api";

const intervalSeconds: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

let passed = 0;

function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`[PASS] ${name}`);
}

for (const [interval, seconds] of Object.entries(
  intervalSeconds,
) as Array<[CandleInterval, number]>) {
  const currentBucket = 1_800_000_000 -
    (1_800_000_000 % seconds);

  test(`${interval}: current bucket`, () => {
    const result = getCandleFreshness({
      interval,
      latestCandleTime: currentBucket,
      sourceTimestamp: null,
      nowMs: (currentBucket + seconds - 1) * 1000,
    });

    assert.equal(result.status, "CURRENT_BUCKET");
    assert.equal(result.marketFreshness, "UNVERIFIED");
    assert.equal(result.intervalSeconds, seconds);
  });

  test(`${interval}: previous bucket`, () => {
    const result = getCandleFreshness({
      interval,
      latestCandleTime: currentBucket,
      sourceTimestamp: null,
      nowMs: (currentBucket + seconds) * 1000,
    });

    assert.equal(result.status, "DELAYED_BUCKET");
    assert.equal(result.marketFreshness, "UNVERIFIED");
  });

  test(`${interval}: future bucket`, () => {
    const result = getCandleFreshness({
      interval,
      latestCandleTime: currentBucket + seconds,
      sourceTimestamp: null,
      nowMs: currentBucket * 1000,
    });

    assert.equal(result.status, "FUTURE_BUCKET");
    assert.equal(result.marketFreshness, "UNVERIFIED");
  });
}

test("Missing candle timestamp", () => {
  const result = getCandleFreshness({
    interval: "1m",
    latestCandleTime: null,
    sourceTimestamp: null,
    nowMs: 1_800_000_000_000,
  });

  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.lagSeconds, null);
});

test("Invalid candle timestamp", () => {
  const result = getCandleFreshness({
    interval: "1m",
    latestCandleTime: Number.NaN,
    sourceTimestamp: null,
    nowMs: 1_800_000_000_000,
  });

  assert.equal(result.status, "UNKNOWN");
});

test("Invalid current time", () => {
  const result = getCandleFreshness({
    interval: "1m",
    latestCandleTime: 1_800_000_000,
    sourceTimestamp: null,
    nowMs: Number.NaN,
  });

  assert.equal(result.status, "UNKNOWN");
});

test("Unverified source never becomes verified", () => {
  const result = getCandleFreshness({
    interval: "1m",
    latestCandleTime: 1_800_000_000,
    sourceTimestamp: null,
    nowMs: 1_800_000_000_000,
  });

  assert.equal(result.marketFreshness, "UNVERIFIED");
});

console.log(`[PASS] candleFreshness: ${passed}/16 tests`);
