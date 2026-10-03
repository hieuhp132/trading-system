import assert from "node:assert/strict";

import {
  calculateAccountMarginRisk,
  evaluateMarginRisk,
} from "./margin-risk.js";

let passed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

test("usedMargin = 0 => NORMAL and marginLevel = null", () => {
  const result = evaluateMarginRisk(
    100_000,
    0,
    100,
    50,
  );

  assert.equal(result.state, "NORMAL");
  assert.equal(result.marginLevel, null);
});

test("margin level > margin call => NORMAL", () => {
  const result = evaluateMarginRisk(
    1_001,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "NORMAL");
  assert.equal(result.marginLevel, 100.1);
});

test("margin level exactly at margin call => MARGIN_CALL", () => {
  const result = evaluateMarginRisk(
    1_000,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "MARGIN_CALL");
  assert.equal(result.marginLevel, 100);
});

test("between margin call and stop out => MARGIN_CALL", () => {
  const result = evaluateMarginRisk(
    750,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "MARGIN_CALL");
  assert.equal(result.marginLevel, 75);
});

test("margin level exactly at stop out => STOP_OUT", () => {
  const result = evaluateMarginRisk(
    500,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "STOP_OUT");
  assert.equal(result.marginLevel, 50);
});

test("margin level below stop out => STOP_OUT", () => {
  const result = evaluateMarginRisk(
    499,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "STOP_OUT");
  assert.equal(result.marginLevel, 49.9);
});

test("negative equity can trigger STOP_OUT", () => {
  const result = evaluateMarginRisk(
    -100,
    1_000,
    100,
    50,
  );

  assert.equal(result.state, "STOP_OUT");
  assert.equal(result.marginLevel, -10);
});

test("negative balance with zero used margin must still trigger STOP_OUT", () => {
  const result = evaluateMarginRisk(
    -50,
    0,
    100,
    50,
  );

  assert.equal(result.state, "STOP_OUT");
  assert.equal(result.marginLevel, null);
});

test("negative used margin is rejected", () => {
  assert.throws(
    () => evaluateMarginRisk(1_000, -1, 100, 50),
    /usedMargin must be >= 0/,
  );
});

test("zero margin-call threshold is rejected", () => {
  assert.throws(
    () => evaluateMarginRisk(1_000, 1_000, 0, 50),
    /margin thresholds must be > 0/,
  );
});

test("zero stop-out threshold is rejected", () => {
  assert.throws(
    () => evaluateMarginRisk(1_000, 1_000, 100, 0),
    /margin thresholds must be > 0/,
  );
});

test("stop-out above margin-call is rejected", () => {
  assert.throws(
    () => evaluateMarginRisk(1_000, 1_000, 50, 100),
    /stopOutLevel must be <= marginCallLevel/,
  );
});

test("non-finite values are rejected", () => {
  assert.throws(
    () => evaluateMarginRisk(Number.NaN, 1_000, 100, 50),
    /equity must be finite/,
  );

  assert.throws(
    () => evaluateMarginRisk(1_000, Number.POSITIVE_INFINITY, 100, 50),
    /usedMargin must be finite/,
  );
});

test("account snapshot can be NORMAL", () => {
  const result = calculateAccountMarginRisk(
    100000,
    100,
    100,
    50,
    [
      {
        side: "LONG",
        quantity: 1,
        entryPrice: 3650,
      },
    ],
    {
      bid: 3649,
      ask: 3650,
    },
  );

  assert.equal(result.state, "NORMAL");
});

test("account snapshot detects STOP_OUT", () => {
  const result = calculateAccountMarginRisk(
    1000,
    100,
    100,
    50,
    [
      {
        side: "LONG",
        quantity: 1,
        entryPrice: 3650,
      },
    ],
    {
      bid: 3630,
      ask: 3631,
    },
  );

  assert.equal(result.state, "STOP_OUT");
  assert.equal(result.equity, -1000);
  assert.equal(result.usedMargin, 3650);
});

test("LONG is valued at BID", () => {
  const result = calculateAccountMarginRisk(
    5000,
    100,
    100,
    50,
    [
      {
        side: "LONG",
        quantity: 1,
        entryPrice: 3650,
      },
    ],
    {
      bid: 3640,
      ask: 3660,
    },
  );

  assert.equal(result.equity, 4000);
});

test("SHORT is valued at ASK", () => {
  const result = calculateAccountMarginRisk(
    5000,
    100,
    100,
    50,
    [
      {
        side: "SHORT",
        quantity: 1,
        entryPrice: 3650,
      },
    ],
    {
      bid: 3640,
      ask: 3660,
    },
  );

  assert.equal(result.equity, 4000);
});

test("account snapshot rejects invalid position", () => {
  assert.throws(
    () =>
      calculateAccountMarginRisk(
        100000,
        100,
        100,
        50,
        [
          {
            side: "LONG",
            quantity: 0,
            entryPrice: 3650,
          },
        ],
        {
          bid: 3650,
          ask: 3651,
        },
      ),
    /position quantity and entry price must be > 0/,
  );
});

console.log("");
console.log(`[PASS] Margin Risk Engine: ${passed}/17 tests`);
