import assert from "node:assert/strict";

import { resolveHistoricalCandleLimit } from "./service.js";

assert.equal(resolveHistoricalCandleLimit("1m"), 500_000);
assert.equal(resolveHistoricalCandleLimit("5m"), 100_000);
assert.equal(resolveHistoricalCandleLimit("15m"), 30_000);
assert.equal(resolveHistoricalCandleLimit("1h"), 8_000);
assert.equal(resolveHistoricalCandleLimit("4h"), 2_000);
assert.equal(resolveHistoricalCandleLimit("1d"), 365);

console.log("[PASS] historical candle limit regression checks");
