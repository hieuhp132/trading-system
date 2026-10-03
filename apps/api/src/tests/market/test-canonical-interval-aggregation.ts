import assert from "node:assert/strict";

import { aggregateCandlesToInterval } from "./candle-aggregation.js";
import type { CandleInterval, MarketCandlesResponse } from "./types.js";

const interval: CandleInterval = "5m";

const canonicalOneMinute: MarketCandlesResponse = {
  symbol: "XAUUSD",
  interval: "1m",
  source: "HISTDATA",
  items: [
    { time: 1_700_000_000, open: "10.00", high: "10.20", low: "9.80", close: "10.10" },
    { time: 1_700_000_060, open: "10.10", high: "10.30", low: "9.90", close: "10.20" },
    { time: 1_700_000_120, open: "10.20", high: "10.50", low: "10.10", close: "10.40" },
    { time: 1_700_000_180, open: "10.40", high: "10.60", low: "10.30", close: "10.50" },
    { time: 1_700_000_240, open: "10.50", high: "10.70", low: "10.40", close: "10.60" },
  ],
};

const result = aggregateCandlesToInterval(canonicalOneMinute, interval);

assert.equal(result?.interval, "5m");
assert.equal(result?.items.length, 2);
assert.equal(result?.items[0]?.close, "10.20");
assert.equal(result?.items[1]?.close, "10.60");
console.log("[PASS] 5m aggregation preserves UTC bucket OHLC from 1m history");
