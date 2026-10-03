import { getCandleDisplayState } from "../src/features/market/candleDisplayState";
import { normalizeCandles } from "../src/features/market/normalizeCandles";
import type { MarketCandles } from "../src/features/market/api";

type Scenario = "NORMAL" | "EMPTY" | "INVALID" | "ERROR";

const validCandle = {
  time: 1780000000,
  open: "3650.00",
  high: "3652.00",
  low: "3649.00",
  close: "3651.00",
};

function mockHttpResponse(scenario: Scenario): Response {
  if (scenario === "ERROR") {
    return new Response(
      JSON.stringify({
        success: false,
        code: "MOCK_CANDLES_ERROR",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const items =
    scenario === "EMPTY"
      ? []
      : scenario === "INVALID"
        ? [{ ...validCandle, high: "3600.00" }]
        : [validCandle];

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        symbol: "XAUUSD",
        interval: "1m",
        source: "demo",
        items,
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function readCandles(
  response: Response,
): Promise<MarketCandles> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json() as {
    success: boolean;
    data: MarketCandles;
  };

  if (!body.success) {
    throw new Error("API response unsuccessful");
  }

  return body.data;
}

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
}

async function main(): Promise<void> {
  const normal = await readCandles(mockHttpResponse("NORMAL"));

  const normalState = getCandleDisplayState({
    data: normal,
    isLoading: false,
    isError: false,
  });

  assert(normalState.status === "ready", "NORMAL status");
  assert(normalState.validCandleCount === 1, "NORMAL count");
  assert(normalizeCandles(normal.items).length === 1, "NORMAL candles");

  console.log("[PASS] NORMAL: HTTP -> ready -> valid candle");

  const empty = await readCandles(mockHttpResponse("EMPTY"));

  const emptyState = getCandleDisplayState({
    data: empty,
    isLoading: false,
    isError: false,
  });

  assert(emptyState.status === "empty", "EMPTY status");
  assert(emptyState.shouldClearChart, "EMPTY must clear chart");

  console.log("[PASS] EMPTY: HTTP -> empty -> clear chart");

  const invalid = await readCandles(mockHttpResponse("INVALID"));

  const invalidState = getCandleDisplayState({
    data: invalid,
    isLoading: false,
    isError: false,
  });

  assert(normalizeCandles(invalid.items).length === 0, "INVALID candles");
  assert(invalidState.status === "empty", "INVALID status");
  assert(invalidState.shouldClearChart, "INVALID must clear chart");

  console.log("[PASS] INVALID: HTTP -> rejected -> clear chart");

  let requestFailed = false;

  try {
    await readCandles(mockHttpResponse("ERROR"));
  } catch (error) {
    requestFailed =
      error instanceof Error &&
      error.message === "HTTP 500";
  }

  assert(requestFailed, "ERROR must reject HTTP 500");

  // Simulate previously successful data retained in query cache.
  const staleState = getCandleDisplayState({
    data: normal,
    isLoading: false,
    isError: true,
  });

  assert(staleState.status === "stale", "ERROR stale status");
  assert(!staleState.shouldClearChart, "ERROR must preserve valid data");
  assert(staleState.shouldShowStaleWarning, "ERROR stale warning");

  console.log("[PASS] ERROR: HTTP 500 -> cached data -> stale warning");

  console.log("[PASS] Candle HTTP flow: 4/4 tests");
}

await main();