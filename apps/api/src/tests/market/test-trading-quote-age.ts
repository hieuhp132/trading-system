import assert from "node:assert/strict";

import {
  validateTradingQuote,
} from "./trading-quote.js";
import type { ExecutionQuote } from "./quote-contract.js";

const now = Date.now();

function quote(ageMs: number): ExecutionQuote {
  const receivedAt = new Date(now - ageMs).toISOString();

  return {
    symbol: "XAUUSD",
    bid: "4197.52",
    ask: "4197.72",
    last: "4197.62",
    source: "twelve-data",
    sourceTimestamp: null,
    receivedAt,
    bidAskType: "SYNTHETIC",
    executionCapability: "LIVE",
    timestamp: receivedAt,
  };
}

validateTradingQuote(quote(20_000), now);
validateTradingQuote(quote(61_000), now);

assert.throws(() => {
  validateTradingQuote(quote(-2_000), now);
});

assert.throws(() => {
  validateTradingQuote({ ...quote(0), receivedAt: "not-a-date" }, now);
});

console.log("[PASS] execution accepts old quotes but rejects invalid timestamps");
