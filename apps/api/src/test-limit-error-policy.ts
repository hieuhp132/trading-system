import assert from "node:assert/strict";

import { classifyLimitError } from "./modules/orders/limit-error-policy.js";

let passed = 0;

function test(name: string, error: unknown, expectedAction: string): void {
  const result = classifyLimitError(error);

  assert.equal(result.action, expectedAction);

  passed++;

  console.log(`[PASS] ${name}`);
}

test(
  "Insufficient margin is deferred",
  { code: "INSUFFICIENT_MARGIN" },
  "DEFER",
);

test("Invalid Stop Loss is deferred", { code: "INVALID_STOP_LOSS" }, "DEFER");

test(
  "Invalid Take Profit is deferred",
  { code: "INVALID_TAKE_PROFIT" },
  "DEFER",
);

test(
  "Existing position stops conflict is deferred",
  { code: "POSITION_STOPS_UPDATE_REQUIRED" },
  "DEFER",
);

test("Stale quote is retried", { code: "STALE_MARKET_QUOTE" }, "RETRY");

test(
  "Unknown error requires investigation",
  new Error("Database connection failed"),
  "INVESTIGATE",
);

test("Null error requires investigation", null, "INVESTIGATE");

console.log(`RESULT: passed=${passed} failed=0`);
