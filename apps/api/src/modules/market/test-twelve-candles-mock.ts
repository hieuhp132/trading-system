import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "twelve-candles-test-"));

const originalFetch = globalThis.fetch;
const originalKey = process.env.TWELVE_DATA_API_KEY;
const originalBudget = process.env.TWELVE_DATA_BUDGET_FILE;

let fetchCalls = 0;
let mockResponse: unknown = null;

try {
  const now = Date.now();

  const budgetFile = join(tempDir, "budget.json");

  await writeFile(
    budgetFile,
    JSON.stringify({
      minuteWindow: Math.floor(now / 60_000),
      minuteCredits: 0,
      utcDay: new Date(now).toISOString().slice(0, 10),
      dailyCredits: 0,
    }),
  );

  process.env.TWELVE_DATA_API_KEY = "offline-test-key";
  process.env.TWELVE_DATA_BUDGET_FILE = budgetFile;

  globalThis.fetch = async (input, init) => {
    fetchCalls++;

    const url = new URL(String(input));

    assert.equal(url.origin, "https://api.twelvedata.com");
    assert.equal(url.pathname, "/time_series");
    assert.equal(url.searchParams.get("symbol"), "XAU/USD");
    assert.equal(url.searchParams.get("interval"), "1min");
    assert.equal(url.searchParams.get("outputsize"), "3");
    assert.equal(url.searchParams.get("timezone"), "UTC");

    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "apikey offline-test-key",
    );

    return new Response(JSON.stringify(mockResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { TwelveDataProvider } = await import(
    "./providers/twelve-data-provider.js"
  );

  const provider = new TwelveDataProvider();

  mockResponse = {
    values: [
      {
        datetime: "2026-09-22 12:02:00",
        open: "3652.00",
        high: "3653.00",
        low: "3651.00",
        close: "3652.50",
      },
      {
        datetime: "2026-09-22 12:00:00",
        open: "3650.00",
        high: "3651.00",
        low: "3649.00",
        close: "3650.50",
      },
      {
        datetime: "2026-02-30 12:01:00",
        open: "3651.00",
        high: "3652.00",
        low: "3650.00",
        close: "3651.50",
      },
    ],
  };

  const result = await provider.getCandles("XAUUSD", "1m", 3);

  assert.equal(result.symbol, "XAUUSD");
  assert.equal(result.interval, "1m");
  assert.equal(result.source, "twelve-data");
  assert.equal(result.items.length, 2);

  assert.deepEqual(
    result.items.map((item) => item.time),
    [
      Date.UTC(2026, 8, 22, 12, 0, 0) / 1000,
      Date.UTC(2026, 8, 22, 12, 2, 0) / 1000,
    ],
  );

  assert.equal(result.items[0].open, "3650.00");
  assert.equal(result.items[1].close, "3652.50");

  console.log("[PASS] URL, UTC, sorting, invalid date and OHLC");

  mockResponse = {
    status: "error",
    message: "Mock provider error",
  };

  await assert.rejects(
    () => provider.getCandles("XAUUSD", "1m", 3),
    (error: unknown) =>
      error instanceof Error &&
      error.message === "Mock provider error",
  );

  console.log("[PASS] Provider error rejected");

  const callsBefore = fetchCalls;

  await assert.rejects(
    () => provider.getCandles("INVALID", "1m", 3),
  );

  assert.equal(fetchCalls, callsBefore);

  console.log("[PASS] Invalid symbol rejected before fetch");

  assert.equal(fetchCalls, 2);

  console.log("[PASS] Twelve Data candles mock integration: 3/3");
}
finally {
  globalThis.fetch = originalFetch;

  if (originalKey === undefined) {
    delete process.env.TWELVE_DATA_API_KEY;
  } else {
    process.env.TWELVE_DATA_API_KEY = originalKey;
  }

  if (originalBudget === undefined) {
    delete process.env.TWELVE_DATA_BUDGET_FILE;
  } else {
    process.env.TWELVE_DATA_BUDGET_FILE = originalBudget;
  }

  await rm(tempDir, { recursive: true, force: true });
}