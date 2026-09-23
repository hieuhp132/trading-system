import assert from "node:assert/strict";
import { DemoMarketDataProvider } from "./providers/demo-market-data-provider.js";
import type { CandleInterval, MarketCandle } from "./types.js";

const provider = new DemoMarketDataProvider();

const intervals: Array<[CandleInterval, number]> = [
  ["1m", 60],
  ["5m", 300],
  ["15m", 900],
  ["1h", 3600],
];

const originalNow = Date.now;
const referenceTime = Date.parse("2026-09-22T12:34:30.000Z");

async function fetchAt(
  interval: CandleInterval,
  limit: number,
  timestamp: number,
) {
  Date.now = () => timestamp;

  try {
    return await provider.getCandles("XAUUSD", interval, limit);
  } finally {
    Date.now = originalNow;
  }
}

function validateCandle(candle: MarketCandle): void {
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);

  assert.ok(Number.isSafeInteger(candle.time) && candle.time > 0);

  for (const value of [open, high, low, close]) {
    assert.ok(Number.isFinite(value) && value > 0);
  }

  assert.ok(high >= Math.max(open, close));
  assert.ok(low <= Math.min(open, close));
}

let passed = 0;

for (const [interval, seconds] of intervals) {
  const before = await fetchAt(interval, 20, referenceTime);
  const after = await fetchAt(
    interval,
    20,
    referenceTime + seconds * 1000,
  );

  assert.equal(before.items.length, 20);
  assert.equal(after.items.length, 20);

  const afterByTime = new Map(
    after.items.map((candle) => [candle.time, candle]),
  );

  let overlaps = 0;

  for (const candle of before.items) {
    const matching = afterByTime.get(candle.time);

    if (matching) {
      assert.deepEqual(matching, candle);
      overlaps++;
    }
  }

  assert.equal(overlaps, 19);

  for (const candle of [...before.items, ...after.items]) {
    validateCandle(candle);
    assert.equal(candle.time % seconds, 0);
  }

  passed++;
  console.log(`[PASS] ${interval}: stable OHLC and valid candles`);
}

for (const interval of intervals.map(([name]) => name)) {
  const short = await fetchAt(interval, 5, referenceTime);
  const long = await fetchAt(interval, 50, referenceTime);

  assert.deepEqual(short.items, long.items.slice(-5));

  passed++;
  console.log(`[PASS] ${interval}: stable across limit 5 vs 50`);
}

console.log(`[PASS] Extended demo candle regression: ${passed}/8`);