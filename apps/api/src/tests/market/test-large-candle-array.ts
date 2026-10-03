import assert from "node:assert/strict";

import { aggregateCandlesToInterval } from "./service.js";

const total = 200_000;
const items = Array.from({ length: total }, (_, index) => ({
  time: 1_700_000_000,
  open: "1.00",
  high: String((index % 97) + 1),
  low: "1.00",
  close: "1.00",
}));

const result = aggregateCandlesToInterval(
  {
    symbol: "XAUUSD",
    interval: "1m",
    source: "test",
    items,
  },
  "5m",
);

assert.equal(result.items.length, 1);
assert.equal(result.items[0].high, "97.00");
assert.equal(result.items[0].low, "1.00");

console.log("[PASS] large candle aggregation does not overflow the call stack");
