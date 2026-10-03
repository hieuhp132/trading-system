import assert from "node:assert/strict";

import {
  MAX_MARKET_CANDLE_LIMIT,
  resolveMarketCandleLimit,
} from "./candle-limits.js";

assert.equal(resolveMarketCandleLimit("1m", {}), 5_000);
assert.equal(resolveMarketCandleLimit("4h", {}), 2_000);
assert.equal(resolveMarketCandleLimit("1d", {}), 1_000);
assert.equal(
  resolveMarketCandleLimit("4h", { MARKET_CANDLES_LIMIT_4H: "2500" }),
  2_500,
);
assert.equal(
  resolveMarketCandleLimit("1d", {
    MARKET_CANDLES_LIMIT_1D: String(MAX_MARKET_CANDLE_LIMIT),
  }),
  MAX_MARKET_CANDLE_LIMIT,
);
assert.throws(() =>
  resolveMarketCandleLimit("1d", { MARKET_CANDLES_LIMIT_1D: "0" }),
);
assert.throws(() =>
  resolveMarketCandleLimit("1d", {
    MARKET_CANDLES_LIMIT_1D: String(MAX_MARKET_CANDLE_LIMIT + 1),
  }),
);

console.log("[PASS] per-interval market candle limit configuration");