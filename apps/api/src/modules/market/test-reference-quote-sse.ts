import assert from "node:assert/strict";

import {
  createReferenceQuoteSseEvent,
  serializeReferenceQuoteSseEvent,
  toReferenceQuoteHttpPayload,
} from "./reference-quote-sse.js";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

const receivedAt =
  "2026-09-24T03:30:00.000Z";

function quote(
  capability: ReferenceQuote["executionCapability"],
): ReferenceQuote {
  return {
    symbol: "XAUUSD",
    bid: "3651.20",
    ask: "3651.40",
    last: "3651.30",
    source: "contract-test",
    sourceTimestamp: null,
    receivedAt,
    bidAskType: "SYNTHETIC",
    executionCapability: capability,
  };
}

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

/*
 * 1. HTTP-compatible shape.
 */
{
  const payload =
    toReferenceQuoteHttpPayload(
      quote("NONE"),
    );

  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      "ask",
      "bid",
      "last",
      "metadata",
      "source",
      "symbol",
      "timestamp",
    ].sort(),
  );

  assert.equal(
    payload.timestamp,
    receivedAt,
  );

  assert.equal(
    payload.metadata.receivedAt,
    receivedAt,
  );

  assert.equal(
    payload.metadata.sourceTimestamp,
    null,
  );

  assert.equal(
    payload.metadata.bidAskType,
    "SYNTHETIC",
  );

  pass("SSE payload preserves HTTP-compatible market shape");
}

/*
 * 2. NONE remains non-executable.
 */
{
  const payload =
    toReferenceQuoteHttpPayload(
      quote("NONE"),
    );

  assert.equal(
    payload.metadata.executable,
    false,
  );

  pass("NONE maps to executable=false");
}

/*
 * 3. PAPER maps to legacy executable=true.
 */
{
  const payload =
    toReferenceQuoteHttpPayload(
      quote("PAPER"),
    );

  assert.equal(
    payload.metadata.executable,
    true,
  );

  pass("PAPER maps to executable=true");
}

/*
 * 4. Internal capability must not leak.
 */
{
  const payload =
    toReferenceQuoteHttpPayload(
      quote("PAPER"),
    );

  assert.equal(
    "executionCapability" in payload,
    false,
  );

  assert.equal(
    "executionCapability" in payload.metadata,
    false,
  );

  pass("internal executionCapability does not leak");
}

/*
 * 5. Reference-only contract must not manufacture
 *    transitional ExecutionQuote timestamp internally.
 */
{
  const reference =
    quote("NONE");

  assert.equal(
    "timestamp" in reference,
    false,
  );

  const payload =
    toReferenceQuoteHttpPayload(reference);

  assert.equal(
    payload.timestamp,
    reference.receivedAt,
  );

  pass("compatibility timestamp exists only in delivery payload");
}

/*
 * 6. Event contract is explicit and stable.
 */
{
  const event =
    createReferenceQuoteSseEvent(
      quote("NONE"),
    );

  assert.equal(
    event.event,
    "quote",
  );

  assert.equal(
    event.data.symbol,
    "XAUUSD",
  );

  pass("SSE event name is quote");
}

/*
 * 7. Wire format follows SSE framing.
 */
{
  const serialized =
    serializeReferenceQuoteSseEvent(
      quote("NONE"),
    );

  assert.ok(
    serialized.startsWith(
      "event: quote\ndata: ",
    ),
  );

  assert.ok(
    serialized.endsWith("\n\n"),
  );

  const lines =
    serialized
      .trimEnd()
      .split("\n");

  assert.equal(
    lines.length,
    2,
  );

  assert.equal(
    lines[0],
    "event: quote",
  );

  const data =
    JSON.parse(
      lines[1].slice("data: ".length),
    ) as {
      symbol: string;
      timestamp: string;
      metadata: {
        executable: boolean;
      };
    };

  assert.equal(
    data.symbol,
    "XAUUSD",
  );

  assert.equal(
    data.timestamp,
    receivedAt,
  );

  assert.equal(
    data.metadata.executable,
    false,
  );

  pass("SSE serialization uses valid event/data framing");
}

/*
 * 8. Serializer is pure:
 *    input quote remains unchanged.
 */
{
  const input =
    quote("PAPER");

  const before =
    JSON.stringify(input);

  serializeReferenceQuoteSseEvent(input);

  assert.equal(
    JSON.stringify(input),
    before,
  );

  assert.equal(
    "timestamp" in input,
    false,
  );

  pass("SSE serialization does not mutate ReferenceQuote");
}

console.log("");
console.log(
  `[PASS] Reference Quote SSE Contract: ${passed}/8 tests`,
);
