import assert from "node:assert/strict";

import type { MarketCandles } from "../src/features/market/api";

import {
  syncCandlesToChart,
  type CandleChartTarget,
  type CandleSeriesTarget,
} from "../src/features/market/syncCandlesToChart";

const validData: MarketCandles = {
  symbol: "XAUUSD",
  interval: "1m",
  source: "demo",
  items: [
    {
      time: 1780000000,
      open: "3650.00",
      high: "3652.00",
      low: "3649.00",
      close: "3651.00",
    },
  ],
};

function createMock() {
  const calls: number[] = [];

  let fits = 0;

  const series: CandleSeriesTarget = {
    setData(data) {
      calls.push(data.length);
    },
  };

  const chart: CandleChartTarget = {
    timeScale() {
      return {
        fitContent() {
          fits++;
        },
      };
    },
  };

  return {
    series,
    chart,
    calls,
    getFits: () => fits,
  };
}

// =========================================================
// TEST 1: INITIAL DATA
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: validData,
    interval: "1m",
    shouldClearChart: false,
    fittedInterval: null,
  });

  assert.deepEqual(mock.calls, [1]);

  assert.equal(mock.getFits(), 1);

  assert.equal(result.fittedInterval, "1m");

  console.log(
    "[PASS] Initial data: setData and fitContent",
  );
}

// =========================================================
// TEST 2: REFRESH PRESERVES ZOOM
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: validData,
    interval: "1m",
    shouldClearChart: false,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [1]);

  assert.equal(mock.getFits(), 0);

  assert.equal(result.fittedInterval, "1m");

  console.log(
    "[PASS] Refresh: preserve zoom",
  );
}

// =========================================================
// TEST 3: EMPTY DATA
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: {
      ...validData,
      items: [],
    },
    interval: "1m",
    shouldClearChart: true,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [0]);

  assert.equal(mock.getFits(), 0);

  assert.equal(result.fittedInterval, null);

  console.log(
    "[PASS] Empty data: clear chart",
  );
}

// =========================================================
// TEST 4: INVALID DATA
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: {
      ...validData,
      items: [
        {
          ...validData.items[0],
          high: "3600.00",
        },
      ],
    },
    interval: "1m",
    shouldClearChart: true,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [0]);

  assert.equal(result.action, "clear");

  console.log(
    "[PASS] Invalid data: clear chart",
  );
}

// =========================================================
// TEST 5: INTERVAL MISMATCH
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: validData,
    interval: "5m",
    shouldClearChart: false,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [0]);

  assert.equal(result.fittedInterval, null);

  console.log(
    "[PASS] Interval mismatch: clear old candles",
  );
}

// =========================================================
// TEST 6: CACHED VALID DATA
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: validData,
    interval: "1m",
    shouldClearChart: false,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [1]);

  assert.equal(mock.getFits(), 0);

  assert.equal(result.action, "update");

  console.log(
    "[PASS] Cached valid data: preserve candles and zoom",
  );
}

// =========================================================
// TEST 7: MISSING DATA
// =========================================================

{
  const mock = createMock();

  const result = syncCandlesToChart({
    ...mock,
    data: undefined,
    interval: "1m",
    shouldClearChart: true,
    fittedInterval: "1m",
  });

  assert.deepEqual(mock.calls, [0]);

  assert.equal(result.fittedInterval, null);

  console.log(
    "[PASS] Missing data: clear chart",
  );
}

console.log(
  "[PASS] syncCandlesToChart: 7/7 tests",
);