import assert from "node:assert/strict";

import { getMarketCandles } from "./service.js";

const candleTime = Math.floor(new Date("2026-09-27T00:30:00Z").getTime() / 1000);

const result = await getMarketCandles("XAUUSD", "1m", 1000);
const includesWeekendCandle = result.items.some((item) => item.time === candleTime);

assert.equal(
  includesWeekendCandle,
  true,
  "weekend candle must remain visible in persisted history",
);

console.log("[PASS] weekend candles remain visible in persisted history");
