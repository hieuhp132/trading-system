import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
process.env.MARKET_DATA_PROVIDER = "demo";
process.env.STOP_WORKER_ENABLED = "false";
process.env.LIMIT_WORKER_ENABLED = "false";

const { default: app } = await import("../../app.js");

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
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/market/candles`;

  const valid = await fetch(`${baseUrl}?symbol=XAUUSD&interval=1m&limit=3`);
  const validBody: unknown = await valid.json();

  assert.equal(valid.status, 200);
  assert.equal(typeof validBody, "object");
  assert.notEqual(validBody, null);

  const validData = validBody as {
    success: boolean;
    data: {
      symbol: string;
      interval: string;
      source: string;
      items: Array<{
        time: number;
        open: string;
        high: string;
        low: string;
        close: string;
      }>;
    };
  };

  assert.equal(validData.success, true);
  assert.equal(validData.data.symbol, "XAUUSD");
  assert.equal(validData.data.interval, "1m");
  assert.equal(validData.data.source, "demo");
  assert.ok(Array.isArray(validData.data.items));
  assert.ok(validData.data.items.length > 0);

  for (const candle of validData.data.items) {
    assert.ok(Number.isFinite(candle.time));

    for (const field of ["open", "high", "low", "close"] as const) {
      assert.ok(Number.isFinite(Number(candle[field])));
    }
  }

  console.log("[PASS] HTTP 200 and candle response structure");

  const invalidInterval = await fetch(`${baseUrl}?interval=2m`);
  const intervalBody = await invalidInterval.json() as {
    code?: string;
  };

  assert.equal(invalidInterval.status, 400);
  assert.equal(intervalBody.code, "INVALID_CANDLE_INTERVAL");

  console.log("[PASS] Invalid interval returns HTTP 400");

  for (const limit of ["0", "501", "abc", "1.5"]) {
    const response = await fetch(`${baseUrl}?limit=${limit}`);
    const body = await response.json() as { code?: string };

    assert.equal(response.status, 400);
    assert.equal(body.code, "INVALID_CANDLE_LIMIT");
  }

  console.log("[PASS] Invalid limits return HTTP 400");
  console.log("[PASS] Candle HTTP integration: 3/3");
}
finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}