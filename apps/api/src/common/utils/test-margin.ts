import assert from "node:assert/strict";

import {
  calculateRequiredMargin,
  calculateUsedMargin,
} from "./margin.js";

let passed = 0;

function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

test("1 lot XAUUSD at 3650 with leverage 100 requires 3650 margin", () => {
  assert.equal(
    calculateRequiredMargin(1, 3650, 100),
    3650,
  );
});

test("0.01 lot XAUUSD uses contract size 100", () => {
  assert.equal(
    calculateRequiredMargin(0.01, 3650, 100),
    36.5,
  );
});

test("used margin sums open positions", () => {
  assert.equal(
    calculateUsedMargin(
      [
        { quantity: 1, entryPrice: 3650 },
        { quantity: 2, entryPrice: 3600 },
      ],
      100,
    ),
    10850,
  );
});

test("invalid leverage is rejected", () => {
  assert.throws(
    () => calculateRequiredMargin(1, 3650, 0),
    /leverage must be finite and > 0/,
  );
});

test("invalid quantity is rejected", () => {
  assert.throws(
    () => calculateRequiredMargin(0, 3650, 100),
    /quantity must be finite and > 0/,
  );
});

test("invalid price is rejected", () => {
  assert.throws(
    () => calculateRequiredMargin(1, Number.NaN, 100),
    /price must be finite and > 0/,
  );
});

console.log("");
console.log(`[PASS] Shared Margin Calculator: ${passed}/6 tests`);
