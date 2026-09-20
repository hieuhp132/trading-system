import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateStopTrigger } from "./stop-trigger.js";
import type { MarketPriceResponse } from "../market/types.js";

function quote(bid: number, ask: number): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "demo",
    timestamp: new Date().toISOString(),
  };
}

test("LONG: BID touches Stop Loss", () => {
  const result = evaluateStopTrigger(
    {
      side: "LONG",
      stopLoss: "3650.00",
      takeProfit: "3670.00",
    },
    quote(3650, 3650.2),
  );

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "STOP_LOSS");
  assert.equal(result.executionPrice, "3650.00");
});

test("LONG: BID touches Take Profit", () => {
  const result = evaluateStopTrigger(
    {
      side: "LONG",
      stopLoss: "3650.00",
      takeProfit: "3670.00",
    },
    quote(3670, 3670.2),
  );

  assert.equal(result.reason, "TAKE_PROFIT");
  assert.equal(result.executionPrice, "3670.00");
});

test("SHORT: ASK touches Stop Loss", () => {
  const result = evaluateStopTrigger(
    {
      side: "SHORT",
      stopLoss: "3670.00",
      takeProfit: "3650.00",
    },
    quote(3669.8, 3670),
  );

  assert.equal(result.reason, "STOP_LOSS");
  assert.equal(result.executionPrice, "3670.00");
});

test("SHORT: ASK touches Take Profit", () => {
  const result = evaluateStopTrigger(
    {
      side: "SHORT",
      stopLoss: "3670.00",
      takeProfit: "3650.00",
    },
    quote(3649.8, 3650),
  );

  assert.equal(result.reason, "TAKE_PROFIT");
  assert.equal(result.executionPrice, "3650.00");
});

test("No trigger when price is between SL and TP", () => {
  const result = evaluateStopTrigger(
    {
      side: "LONG",
      stopLoss: "3650.00",
      takeProfit: "3670.00",
    },
    quote(3660, 3660.2),
  );

  assert.deepEqual(result, {
    triggered: false,
    reason: null,
    executionPrice: null,
  });
});

test("No trigger when SL and TP are null", () => {
  const result = evaluateStopTrigger(
    {
      side: "LONG",
      stopLoss: null,
      takeProfit: null,
    },
    quote(3660, 3660.2),
  );

  assert.equal(result.triggered, false);
});

test("Reject invalid market quote", () => {
  assert.throws(() =>
    evaluateStopTrigger(
      {
        side: "LONG",
        stopLoss: "3650.00",
        takeProfit: null,
      },
      quote(3670, 3660),
    ),
  );
});
