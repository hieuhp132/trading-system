import assert from "node:assert/strict";

import { applyQuoteToCandle } from "./quote-candle.js";

const opened = applyQuoteToCandle(null, 1_800_000_000, 4199.25);
assert.deepEqual(opened, {
  time: 1_800_000_000,
  open: "4199.25",
  high: "4199.25",
  low: "4199.25",
  close: "4199.25",
});

const updated = applyQuoteToCandle(opened, 1_800_000_000, 4201.5);
assert.deepEqual(updated, {
  time: 1_800_000_000,
  open: "4199.25",
  high: "4201.50",
  low: "4199.25",
  close: "4201.50",
});

const retraced = applyQuoteToCandle(updated, 1_800_000_000, 4198.75);
assert.equal(retraced.open, "4199.25");
assert.equal(retraced.high, "4201.50");
assert.equal(retraced.low, "4198.75");
assert.equal(retraced.close, "4198.75");

assert.throws(() => applyQuoteToCandle(null, 1_800_000_000, 0));
console.log("[PASS] quote candle OHLC update invariants");