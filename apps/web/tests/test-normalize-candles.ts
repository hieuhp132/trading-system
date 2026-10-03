function assert(condition: unknown): asserts condition {
  if (!condition) {
    throw new Error("Assertion failed");
  }
}

assert.equal = (actual: unknown, expected: unknown): void => {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `Expected ${String(expected)}, received ${String(actual)}`,
    );
  }
};

assert.deepEqual = (actual: unknown, expected: unknown): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
};

import { normalizeCandles } from "../src/features/market/normalizeCandles";
import type { MarketCandle } from "../src/features/market/api";

function candle(
  time: number,
  open = "100",
  high = "110",
  low = "90",
  close = "105",
): MarketCandle {
  return { time, open, high, low, close };
}

let passed = 0;

function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`[PASS] ${name}`);
}

test("Sort timestamps ascending", () => {
  const result = normalizeCandles([
    candle(300),
    candle(100),
    candle(200),
  ]);

  assert.deepEqual(
    result.map((item) => item.time),
    [100, 200, 300],
  );
});

test("Keep last duplicate timestamp", () => {
  const result = normalizeCandles([
    candle(100, "100", "110", "90", "105"),
    candle(100, "101", "111", "91", "106"),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].open, 101);
  assert.equal(result[0].close, 106);
});

test("Reject invalid timestamps", () => {
  const result = normalizeCandles([
    candle(0),
    candle(-1),
    candle(1.5),
    candle(Number.NaN),
    candle(Number.POSITIVE_INFINITY),
    candle(100),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].time, 100);
});

test("Reject non-finite and non-positive OHLC", () => {
  const result = normalizeCandles([
    candle(100, "NaN"),
    candle(200, "Infinity"),
    candle(300, "0"),
    candle(400, "-1"),
    candle(500, "100"),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].time, 500);
});

test("Reject invalid OHLC relationships", () => {
  const result = normalizeCandles([
    candle(100, "100", "99", "90", "105"),
    candle(200, "100", "110", "106", "105"),
    candle(300, "100", "110", "90", "105"),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].time, 300);
});

test("Convert valid OHLC strings to numbers", () => {
  const result = normalizeCandles([
    candle(100, "100.25", "110.50", "90.10", "105.75"),
  ]);

  assert.deepEqual(result[0], {
    time: 100,
    open: 100.25,
    high: 110.5,
    low: 90.1,
    close: 105.75,
  });
});

test("Return empty array for empty input", () => {
  assert.deepEqual(normalizeCandles([]), []);
});

console.log(`[PASS] normalizeCandles: ${passed}/7 tests`);