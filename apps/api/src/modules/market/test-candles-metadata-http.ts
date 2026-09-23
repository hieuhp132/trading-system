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

  const beforeRequest = Date.now();

  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/v1/market/candles?symbol=XAUUSD&interval=1m&limit=3`,
  );

  const afterRequest = Date.now();

  assert.equal(response.status, 200);

  const body: unknown = await response.json();

  assert.ok(body && typeof body === "object");

  const result = body as {
    success: boolean;
    data: {
      symbol: string;
      interval: string;
      source: string;
      items: Array<{ time: number }>;
      metadata: {
        receivedAt: string;
        sourceTimestamp: string | null;
        latestCandleTime: number | null;
      };
    };
  };

  assert.equal(result.success, true);
  assert.equal(result.data.symbol, "XAUUSD");
  assert.equal(result.data.interval, "1m");
  assert.equal(result.data.source, "demo");
  assert.equal(result.data.items.length, 3);

  console.log("[PASS] Existing response contract preserved");

  const metadata = result.data.metadata;

  assert.ok(metadata);
  assert.equal(typeof metadata.receivedAt, "string");

  const receivedAtMs = Date.parse(metadata.receivedAt);

  assert.ok(Number.isFinite(receivedAtMs));
  assert.equal(
    new Date(receivedAtMs).toISOString(),
    metadata.receivedAt,
  );

  assert.ok(receivedAtMs >= beforeRequest);
  assert.ok(receivedAtMs <= afterRequest);

  console.log("[PASS] receivedAt is valid UTC within request window");

  assert.equal(metadata.sourceTimestamp, null);

  console.log("[PASS] Unverified source timestamp remains null");

  const latest = Math.max(
    ...result.data.items.map((item) => item.time),
  );

  assert.equal(metadata.latestCandleTime, latest);

  console.log("[PASS] latestCandleTime matches maximum candle time");

  console.log("[PASS] Candle metadata HTTP integration: 4/4");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}