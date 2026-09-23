import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";

type Scenario = "NORMAL" | "EMPTY" | "INVALID" | "ERROR";

let scenario: Scenario = "NORMAL";

const app = express();

app.get("/api/v1/market/candles", (_req, res) => {
  if (scenario === "ERROR") {
    res.status(500).json({
      success: false,
      code: "MOCK_CANDLES_ERROR",
      message: "Simulated candle provider failure",
    });
    return;
  }

  const validCandle = {
    time: 1780000000,
    open: "3650.00",
    high: "3652.00",
    low: "3649.00",
    close: "3651.00",
  };

  const items =
    scenario === "EMPTY"
      ? []
      : scenario === "INVALID"
        ? [{ ...validCandle, high: "3600.00" }]
        : [validCandle];

  res.status(200).json({
    success: true,
    data: {
      symbol: "XAUUSD",
      interval: "1m",
      source: "demo",
      items,
    },
  });
});

const server = app.listen(0, "127.0.0.1");

try {
  await new Promise<void>((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }

    server.once("listening", resolve);
    server.once("error", reject);
  });

  const address = server.address() as AddressInfo;

  const url =
    `http://127.0.0.1:${address.port}/api/v1/market/candles`;

  scenario = "NORMAL";

  const normal = await fetch(url);
  const normalBody = await normal.json() as {
    success: boolean;
    data: { items: unknown[] };
  };

  assert.equal(normal.status, 200);
  assert.equal(normalBody.success, true);
  assert.equal(normalBody.data.items.length, 1);

  console.log("[PASS] NORMAL: HTTP 200 with valid candle");

  scenario = "EMPTY";

  const empty = await fetch(url);
  const emptyBody = await empty.json() as {
    data: { items: unknown[] };
  };

  assert.equal(empty.status, 200);
  assert.deepEqual(emptyBody.data.items, []);

  console.log("[PASS] EMPTY: HTTP 200 with empty items");

  scenario = "INVALID";

  const invalid = await fetch(url);
  const invalidBody = await invalid.json() as {
    data: {
      items: Array<{
        open: string;
        high: string;
        close: string;
      }>;
    };
  };

  assert.equal(invalid.status, 200);
  assert.equal(invalidBody.data.items.length, 1);

  const candle = invalidBody.data.items[0];

  assert.ok(Number(candle.high) < Number(candle.open));

  console.log("[PASS] INVALID: HTTP 200 with invalid OHLC");

  scenario = "ERROR";

  const error = await fetch(url);
  const errorBody = await error.json() as {
    success: boolean;
    code: string;
  };

  assert.equal(error.status, 500);
  assert.equal(errorBody.success, false);
  assert.equal(errorBody.code, "MOCK_CANDLES_ERROR");

  console.log("[PASS] ERROR: HTTP 500");

  console.log("[PASS] Candle error mock HTTP: 4/4");
}
finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}