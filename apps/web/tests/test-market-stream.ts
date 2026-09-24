import assert from "node:assert/strict";

import {
  getMarketStreamUrl,
  parseMarketPriceEvent,
} from "../src/features/market/stream";

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

const validPayload = {
  symbol: "XAUUSD",
  bid: "3651.20",
  ask: "3651.40",
  last: "3651.30",
  source: "demo",
  timestamp: "2026-09-24T00:00:00.000Z",

  metadata: {
    receivedAt:
      "2026-09-24T00:00:00.000Z",

    sourceTimestamp:
      null,

    bidAskType:
      "SYNTHETIC",

    executable:
      true,
  },
};

/*
 * 1. Parse backend-compatible quote.
 */
{
  const result =
    parseMarketPriceEvent(
      JSON.stringify(validPayload),
    );

  assert.equal(
    result.symbol,
    "XAUUSD",
  );

  assert.equal(
    result.metadata.executable,
    true,
  );

  pass("parses valid market SSE payload");
}

/*
 * 2. Preserves complete MarketPrice shape.
 */
{
  const result =
    parseMarketPriceEvent(
      JSON.stringify(validPayload),
    );

  assert.deepEqual(
    result,
    validPayload,
  );

  pass("preserves MarketPrice delivery shape");
}

/*
 * 3. Twelve reference payload is accepted.
 */
{
  const result =
    parseMarketPriceEvent(
      JSON.stringify({
        ...validPayload,
        source: "twelve-data",

        metadata: {
          ...validPayload.metadata,
          executable: false,
        },
      }),
    );

  assert.equal(
    result.source,
    "twelve-data",
  );

  assert.equal(
    result.metadata.executable,
    false,
  );

  pass("accepts non-executable Twelve reference payload");
}

/*
 * 4. Invalid JSON fails closed.
 */
{
  assert.throws(
    () =>
      parseMarketPriceEvent(
        "{invalid-json",
      ),
  );

  pass("invalid JSON is rejected");
}

/*
 * 5. Missing metadata fails closed.
 */
{
  const {
    metadata: _metadata,
    ...withoutMetadata
  } = validPayload;

  assert.throws(
    () =>
      parseMarketPriceEvent(
        JSON.stringify(
          withoutMetadata,
        ),
      ),
  );

  pass("missing metadata is rejected");
}

/*
 * 6. Internal capability must not become
 *    part of the returned MarketPrice.
 */
{
  const result =
    parseMarketPriceEvent(
      JSON.stringify({
        ...validPayload,
        executionCapability: "LIVE",
      }),
    ) as unknown as Record<string, unknown>;

  assert.equal(
    "executionCapability" in result,
    false,
  );

  pass("internal executionCapability is stripped");
}

/*
 * 7. URL uses API base and normalized symbol.
 */
{
  const result =
    getMarketStreamUrl(
      " xauusd ",
      "http://localhost:4000/api/v1",
    );

  assert.equal(
    result,
    "http://localhost:4000/api/v1/market/stream?symbol=XAUUSD",
  );

  pass("builds normalized market stream URL");
}

/*
 * 8. Trailing API slash is normalized.
 */
{
  const result =
    getMarketStreamUrl(
      "XAUUSD",
      "http://localhost:4000/api/v1/",
    );

  assert.equal(
    result,
    "http://localhost:4000/api/v1/market/stream?symbol=XAUUSD",
  );

  pass("normalizes trailing API slash");
}

/*
 * 9. Empty symbol fails closed.
 */
{
  assert.throws(
    () =>
      getMarketStreamUrl(
        "   ",
        "http://localhost:4000/api/v1",
      ),
  );

  pass("empty stream symbol is rejected");
}

/*
 * 10. Empty API base fails closed.
 */
{
  assert.throws(
    () =>
      getMarketStreamUrl(
        "XAUUSD",
        "   ",
      ),
  );

  pass("empty API base URL is rejected");
}

console.log("");
console.log(
  `[PASS] Market Stream Contract: ${passed}/10 tests`,
);
