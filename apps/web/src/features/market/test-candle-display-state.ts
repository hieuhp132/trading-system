import { getCandleDisplayState } from "./candleDisplayState";
import type { MarketCandles } from "./api";

function assertEqual(
  actual: unknown,
  expected: unknown,
  name: string,
): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      `[FAIL] ${name}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const validData: MarketCandles = {
  symbol: "XAUUSD",
  interval: "1m",
  source: "demo",
  items: [
    {
      time: 100,
      open: "100",
      high: "110",
      low: "90",
      close: "105",
    },
  ],
};

let passed = 0;

function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`[PASS] ${name}`);
}

test("Loading without data", () => {
  const result = getCandleDisplayState({
    data: undefined,
    isLoading: true,
    isError: false,
  });

  assertEqual(result.status, "loading", "status");
  assertEqual(result.shouldClearChart, true, "clear");
});

test("Valid data", () => {
  const result = getCandleDisplayState({
    data: validData,
    isLoading: false,
    isError: false,
  });

  assertEqual(result.status, "ready", "status");
  assertEqual(result.validCandleCount, 1, "count");
  assertEqual(result.shouldClearChart, false, "clear");
});

test("Empty API response", () => {
  const result = getCandleDisplayState({
    data: { ...validData, items: [] },
    isLoading: false,
    isError: false,
  });

  assertEqual(result.status, "empty", "status");
  assertEqual(result.shouldClearChart, true, "clear");
});

test("Invalid candles only", () => {
  const result = getCandleDisplayState({
    data: {
      ...validData,
      items: [
        {
          time: 100,
          open: "100",
          high: "90",
          low: "110",
          close: "105",
        },
      ],
    },
    isLoading: false,
    isError: false,
  });

  assertEqual(result.status, "empty", "status");
  assertEqual(result.validCandleCount, 0, "count");
});

test("API error without cached data", () => {
  const result = getCandleDisplayState({
    data: undefined,
    isLoading: false,
    isError: true,
  });

  assertEqual(result.status, "error", "status");
  assertEqual(result.shouldClearChart, true, "clear");
  assertEqual(result.shouldShowStaleWarning, false, "stale warning");
});

test("API error with valid cached data", () => {
  const result = getCandleDisplayState({
    data: validData,
    isLoading: false,
    isError: true,
  });

  assertEqual(result.status, "stale", "status");
  assertEqual(result.shouldClearChart, false, "clear");
  assertEqual(result.shouldShowStaleWarning, true, "stale warning");
});

console.log(`[PASS] candleDisplayState: ${passed}/6 tests`);