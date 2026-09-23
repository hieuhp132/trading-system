import assert from "node:assert/strict";

import { DemoMarketDataProvider } from "./providers/demo-market-data-provider.js";

const provider = new DemoMarketDataProvider();

const originalDateNow = Date.now;

async function getCandlesAt(isoTime: string) {
  const timestamp = Date.parse(isoTime);

  Date.now = () => timestamp;

  try {
    return await provider.getCandles("XAUUSD", "1m", 5);
  } finally {
    Date.now = originalDateNow;
  }
}

const before = await getCandlesAt("2026-09-22T10:00:30.000Z");

const after = await getCandlesAt("2026-09-22T10:01:30.000Z");

assert.equal(before.items.length, 5);
assert.equal(after.items.length, 5);

const beforeByTime = new Map(
  before.items.map((candle) => [candle.time, candle]),
);

const afterByTime = new Map(
  after.items.map((candle) => [candle.time, candle]),
);

const closedBefore = before.items.filter(
  (candle) =>
    candle.time < Date.parse("2026-09-22T10:00:00.000Z") / 1000 &&
    afterByTime.has(candle.time),
);

assert.ok(closedBefore.length > 0);

for (const candle of closedBefore) {
  const next = afterByTime.get(candle.time);

  assert.ok(next, `Missing overlapping candle: ${candle.time}`);

  assert.deepEqual(
    next,
    candle,
    `Historical candle changed: ${candle.time}`,
  );
}

console.log("[PASS] Previously closed candles remain unchanged");

const formerCurrentTime =
  Date.parse("2026-09-22T10:00:00.000Z") / 1000;

const formerCurrent = beforeByTime.get(formerCurrentTime);
const newlyClosed = afterByTime.get(formerCurrentTime);

assert.ok(formerCurrent);
assert.ok(newlyClosed);

assert.deepEqual(
  newlyClosed,
  formerCurrent,
  "Former current candle changed after closing",
);

console.log("[PASS] Former current candle remains unchanged");

console.log("[PASS] Demo candle stability: 2/2");