import assert from "node:assert/strict";

import {
  createReferenceQuoteFreshnessSseEvent,
  serializeReferenceQuoteFreshnessSseEvent,
} from "./reference-quote-sse.js";

import type {
  ReferenceQuoteFreshnessResult,
} from "./reference-quote-freshness.js";

let passed = 0;

function test(
  name: string,
  run: () => void,
): void {
  run();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

function freshness(
  status: ReferenceQuoteFreshnessResult["status"],
  ageMs: number | null,
): ReferenceQuoteFreshnessResult {
  return {
    status,
    ageMs,
  };
}

test("FRESH event has explicit contract", () => {
  const event =
    createReferenceQuoteFreshnessSseEvent(
      "xauusd",
      freshness("FRESH", 1_250),
    );

  assert.deepEqual(event, {
    event: "freshness",
    data: {
      symbol: "XAUUSD",
      status: "FRESH",
      ageMs: 1_250,
    },
  });
});

test("STALE event preserves age", () => {
  const event =
    createReferenceQuoteFreshnessSseEvent(
      "XAUUSD",
      freshness("STALE", 7_001),
    );

  assert.equal(event.data.status, "STALE");
  assert.equal(event.data.ageMs, 7_001);
});

test("MISSING event preserves null age", () => {
  const event =
    createReferenceQuoteFreshnessSseEvent(
      "XAUUSD",
      freshness("MISSING", null),
    );

  assert.deepEqual(event.data, {
    symbol: "XAUUSD",
    status: "MISSING",
    ageMs: null,
  });
});

test("symbol is normalized", () => {
  const event =
    createReferenceQuoteFreshnessSseEvent(
      "  xauusd  ",
      freshness("FRESH", 0),
    );

  assert.equal(
    event.data.symbol,
    "XAUUSD",
  );
});

test("empty symbol is rejected", () => {
  assert.throws(
    () =>
      createReferenceQuoteFreshnessSseEvent(
        "   ",
        freshness("MISSING", null),
      ),
    /symbol/,
  );
});

test("wire event name is freshness", () => {
  const serialized =
    serializeReferenceQuoteFreshnessSseEvent(
      "XAUUSD",
      freshness("FRESH", 250),
    );

  assert.ok(
    serialized.startsWith(
      "event: freshness\ndata: ",
    ),
  );

  assert.ok(
    serialized.endsWith("\n\n"),
  );
});

test("serialized FRESH payload is valid JSON", () => {
  const serialized =
    serializeReferenceQuoteFreshnessSseEvent(
      "XAUUSD",
      freshness("FRESH", 250),
    );

  const line =
    serialized
      .trimEnd()
      .split("\n")
      .find((value) =>
        value.startsWith("data: "),
      );

  assert.ok(line);

  assert.deepEqual(
    JSON.parse(line.slice(6)),
    {
      symbol: "XAUUSD",
      status: "FRESH",
      ageMs: 250,
    },
  );
});

test("serialized MISSING payload has null age", () => {
  const serialized =
    serializeReferenceQuoteFreshnessSseEvent(
      "XAUUSD",
      freshness("MISSING", null),
    );

  const line =
    serialized
      .trimEnd()
      .split("\n")
      .find((value) =>
        value.startsWith("data: "),
      );

  assert.ok(line);

  const data =
    JSON.parse(line.slice(6)) as {
      ageMs: number | null;
    };

  assert.equal(data.ageMs, null);
});

test("serializer does not mutate freshness input", () => {
  const input =
    freshness("STALE", 9_000);

  const before =
    JSON.stringify(input);

  serializeReferenceQuoteFreshnessSseEvent(
    "XAUUSD",
    input,
  );

  assert.equal(
    JSON.stringify(input),
    before,
  );
});

console.log("");
console.log(
  `[PASS] Reference Quote Freshness SSE Contract: ${passed}/9 tests`,
);
