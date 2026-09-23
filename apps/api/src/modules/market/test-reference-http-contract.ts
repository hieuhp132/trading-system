import assert from "node:assert/strict";

import type {
  Request,
  Response,
} from "express";

process.env.MARKET_DATA_PROVIDER = "demo";

let fetchCalls = 0;

const originalFetch = globalThis.fetch;

globalThis.fetch = async () => {
  fetchCalls += 1;

  throw new Error(
    "NETWORK_CALL_FORBIDDEN_IN_HTTP_CONTRACT_TEST",
  );
};

interface HttpPayload {
  success: boolean;
  data: {
    symbol: string;
    bid: string;
    ask: string;
    last: string;
    source: string;
    timestamp: string;
    metadata: {
      receivedAt: string;
      sourceTimestamp: string | null;
      bidAskType: "REAL" | "SYNTHETIC";
      executable: boolean;
    };
  };
}

try {
  const {
    getPrice,
  } = await import("./controller.js");

  let statusCode: number | null = null;
  let payload: HttpPayload | null = null;

  const req = {
    query: {
      symbol: "XAUUSD",
    },
  } as unknown as Request;

  const res = {
    status(code: number) {
      statusCode = code;

      return this;
    },

    json(body: HttpPayload) {
      payload = body;

      return this;
    },
  } as unknown as Response;

  await getPrice(req, res);

  assert.equal(
    statusCode,
    200,
    "controller must preserve HTTP 200",
  );

  assert.ok(
    payload,
    "controller must return a payload",
  );

  const result = payload as HttpPayload;

  assert.equal(
    result.success,
    true,
  );

  assert.equal(
    result.data.symbol,
    "XAUUSD",
  );

  assert.equal(
    result.data.source,
    "demo",
  );

  assert.equal(
    typeof result.data.bid,
    "string",
  );

  assert.equal(
    typeof result.data.ask,
    "string",
  );

  assert.equal(
    typeof result.data.last,
    "string",
  );

  /*
   * Legacy HTTP compatibility:
   * frontend still consumes top-level timestamp.
   */
  assert.equal(
    typeof result.data.timestamp,
    "string",
  );

  assert.equal(
    result.data.timestamp,
    result.data.metadata.receivedAt,
    "legacy timestamp must equal canonical receivedAt",
  );

  assert.equal(
    Number.isNaN(
      Date.parse(result.data.timestamp),
    ),
    false,
    "timestamp must remain valid ISO datetime",
  );

  assert.equal(
    result.data.metadata.sourceTimestamp,
    null,
  );

  assert.equal(
    result.data.metadata.bidAskType,
    "SYNTHETIC",
  );

  /*
   * Demo has executionCapability=PAPER.
   * HTTP compatibility boolean must therefore be true.
   */
  assert.equal(
    result.data.metadata.executable,
    true,
    "PAPER reference quote must map to executable=true for legacy HTTP clients",
  );

  /*
   * Do not leak new internal contract fields into the
   * backward-compatible HTTP payload yet.
   */
  assert.equal(
    "executionCapability" in result.data,
    false,
    "internal executionCapability must not alter current HTTP shape",
  );

  assert.equal(
    "receivedAt" in result.data,
    false,
    "receivedAt belongs under metadata in current HTTP contract",
  );

  assert.equal(
    fetchCalls,
    0,
    "demo HTTP contract test must not access network",
  );

  console.log(
    "[PASS] HTTP status = 200",
  );

  console.log(
    "[PASS] legacy price fields preserved",
  );

  console.log(
    "[PASS] timestamp === metadata.receivedAt",
  );

  console.log(
    "[PASS] metadata.sourceTimestamp = null",
  );

  console.log(
    "[PASS] metadata.bidAskType = SYNTHETIC",
  );

  console.log(
    "[PASS] PAPER -> metadata.executable = true",
  );

  console.log(
    "[PASS] internal capability fields do not leak",
  );

  console.log(
    "[PASS] network calls = 0",
  );

  console.log("");
  console.log(
    "[PASS] Reference HTTP Contract: 8/8",
  );
} finally {
  globalThis.fetch = originalFetch;
}
