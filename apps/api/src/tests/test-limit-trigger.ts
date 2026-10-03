import assert from "node:assert/strict";

import { evaluateLimitTrigger } from "../modules/orders/limit-trigger.js";

import type { MarketPriceResponse } from "../modules/market/types.js";

function quote(bid: number, ask: number): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "unit-test",
    timestamp: new Date().toISOString(),
  };
}

let passed = 0;

function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`[PASS] ${name}`);
}

test("BUY LIMIT chưa chạm giá", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "BUY_LIMIT",
      requestedPrice: "3650.00",
    },
    quote(3651.0, 3651.2),
  );

  assert.deepEqual(result, {
    triggered: false,
    executionPrice: null,
  });
});

test("BUY LIMIT chạm đúng giá", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "BUY_LIMIT",
      requestedPrice: "3650.00",
    },
    quote(3649.8, 3650.0),
  );

  assert.deepEqual(result, {
    triggered: true,
    executionPrice: "3650.00",
  });
});

test("BUY LIMIT được giá tốt hơn", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "BUY_LIMIT",
      requestedPrice: "3650.00",
    },
    quote(3648.8, 3649.0),
  );

  assert.deepEqual(result, {
    triggered: true,
    executionPrice: "3649.00",
  });
});

test("SELL LIMIT chưa chạm giá", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "SELL_LIMIT",
      requestedPrice: "3660.00",
    },
    quote(3659.0, 3659.2),
  );

  assert.deepEqual(result, {
    triggered: false,
    executionPrice: null,
  });
});

test("SELL LIMIT chạm đúng giá", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "SELL_LIMIT",
      requestedPrice: "3660.00",
    },
    quote(3660.0, 3660.2),
  );

  assert.deepEqual(result, {
    triggered: true,
    executionPrice: "3660.00",
  });
});

test("SELL LIMIT được giá tốt hơn", () => {
  const result = evaluateLimitTrigger(
    {
      orderType: "SELL_LIMIT",
      requestedPrice: "3660.00",
    },
    quote(3661.0, 3661.2),
  );

  assert.deepEqual(result, {
    triggered: true,
    executionPrice: "3661.00",
  });
});

test("BID lớn hơn ASK bị từ chối", () => {
  assert.throws(() =>
    evaluateLimitTrigger(
      {
        orderType: "BUY_LIMIT",
        requestedPrice: "3650.00",
      },
      quote(3652.0, 3651.0),
    ),
  );
});

console.log(`RESULT: passed=${passed} failed=0`);
