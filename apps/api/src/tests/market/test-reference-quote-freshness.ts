import assert from "node:assert/strict";

import {
  getReferenceQuoteFreshness,
} from "./reference-quote-freshness.js";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

let passed = 0;

function test(
  name: string,
  run: () => void,
): void {
  run();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

function makeQuote(
  receivedAt: string,
): ReferenceQuote {
  return {
    symbol: "XAUUSD",
    bid: "3651.20",
    ask: "3651.40",
    last: "3651.30",
    source: "demo",
    sourceTimestamp: null,
    receivedAt,
    bidAskType: "SYNTHETIC",
    executionCapability: "PAPER",
  };
}

const now =
  Date.parse("2026-09-24T04:00:10.000Z");

const options = {
  staleAfterMs: 5_000,
};

test("missing quote -> MISSING", () => {
  assert.deepEqual(
    getReferenceQuoteFreshness(
      null,
      now,
      options,
    ),
    {
      status: "MISSING",
      ageMs: null,
    },
  );
});

test("new quote -> FRESH", () => {
  assert.deepEqual(
    getReferenceQuoteFreshness(
      makeQuote(
        "2026-09-24T04:00:09.000Z",
      ),
      now,
      options,
    ),
    {
      status: "FRESH",
      ageMs: 1_000,
    },
  );
});

test("threshold quote remains FRESH", () => {
  assert.deepEqual(
    getReferenceQuoteFreshness(
      makeQuote(
        "2026-09-24T04:00:05.000Z",
      ),
      now,
      options,
    ),
    {
      status: "FRESH",
      ageMs: 5_000,
    },
  );
});

test("older quote -> STALE", () => {
  assert.deepEqual(
    getReferenceQuoteFreshness(
      makeQuote(
        "2026-09-24T04:00:04.999Z",
      ),
      now,
      options,
    ),
    {
      status: "STALE",
      ageMs: 5_001,
    },
  );
});

test("future receivedAt clamps age to zero", () => {
  assert.deepEqual(
    getReferenceQuoteFreshness(
      makeQuote(
        "2026-09-24T04:00:11.000Z",
      ),
      now,
      options,
    ),
    {
      status: "FRESH",
      ageMs: 0,
    },
  );
});

test("sourceTimestamp does not drive freshness", () => {
  const quote =
    makeQuote(
      "2026-09-24T04:00:09.000Z",
    );

  quote.sourceTimestamp =
    "2020-01-01T00:00:00.000Z";

  assert.equal(
    getReferenceQuoteFreshness(
      quote,
      now,
      options,
    ).status,
    "FRESH",
  );
});

test("invalid stale threshold is rejected", () => {
  assert.throws(
    () =>
      getReferenceQuoteFreshness(
        makeQuote(
          "2026-09-24T04:00:09.000Z",
        ),
        now,
        {
          staleAfterMs: 0,
        },
      ),
    /staleAfterMs/,
  );
});

test("non-integer stale threshold is rejected", () => {
  assert.throws(
    () =>
      getReferenceQuoteFreshness(
        makeQuote(
          "2026-09-24T04:00:09.000Z",
        ),
        now,
        {
          staleAfterMs: 1.5,
        },
      ),
    /staleAfterMs/,
  );
});

test("invalid nowMs is rejected", () => {
  assert.throws(
    () =>
      getReferenceQuoteFreshness(
        makeQuote(
          "2026-09-24T04:00:09.000Z",
        ),
        Number.NaN,
        options,
      ),
    /nowMs/,
  );
});

test("invalid receivedAt is rejected", () => {
  assert.throws(
    () =>
      getReferenceQuoteFreshness(
        makeQuote("invalid"),
        now,
        options,
      ),
    /receivedAt/,
  );
});

console.log(
  `\n[PASS] Reference Quote Freshness: ${passed}/10`,
);
