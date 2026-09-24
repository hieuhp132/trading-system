import assert from "node:assert/strict";

import {
  parseMarketFreshnessEvent,
} from "../src/features/market/stream.js";

let passed = 0;

function test(
  name: string,
  run: () => void,
): void {
  run();
  passed += 1;
  console.log(`[PASS] ${name}`);
}

function expectInvalid(
  payload: unknown,
): void {
  assert.throws(
    () =>
      parseMarketFreshnessEvent(
        JSON.stringify(payload),
      ),
    /Invalid market freshness payload/,
  );
}

test(
  "FRESH payload is parsed",
  () => {
    assert.deepEqual(
      parseMarketFreshnessEvent(
        JSON.stringify({
          symbol: "XAUUSD",
          status: "FRESH",
          ageMs: 250,
        }),
      ),
      {
        symbol: "XAUUSD",
        status: "FRESH",
        ageMs: 250,
      },
    );
  },
);

test(
  "STALE payload preserves age",
  () => {
    assert.deepEqual(
      parseMarketFreshnessEvent(
        JSON.stringify({
          symbol: "XAUUSD",
          status: "STALE",
          ageMs: 5001,
        }),
      ),
      {
        symbol: "XAUUSD",
        status: "STALE",
        ageMs: 5001,
      },
    );
  },
);

test(
  "MISSING payload preserves null age",
  () => {
    assert.deepEqual(
      parseMarketFreshnessEvent(
        JSON.stringify({
          symbol: "XAUUSD",
          status: "MISSING",
          ageMs: null,
        }),
      ),
      {
        symbol: "XAUUSD",
        status: "MISSING",
        ageMs: null,
      },
    );
  },
);

test(
  "symbol is normalized",
  () => {
    assert.equal(
      parseMarketFreshnessEvent(
        JSON.stringify({
          symbol: " xauusd ",
          status: "FRESH",
          ageMs: 0,
        }),
      ).symbol,
      "XAUUSD",
    );
  },
);

test(
  "empty symbol is rejected",
  () => {
    expectInvalid({
      symbol: "   ",
      status: "FRESH",
      ageMs: 0,
    });
  },
);

test(
  "unknown freshness status is rejected",
  () => {
    expectInvalid({
      symbol: "XAUUSD",
      status: "ONLINE",
      ageMs: 0,
    });
  },
);

test(
  "MISSING with numeric age is rejected",
  () => {
    expectInvalid({
      symbol: "XAUUSD",
      status: "MISSING",
      ageMs: 0,
    });
  },
);

test(
  "FRESH without age is rejected",
  () => {
    expectInvalid({
      symbol: "XAUUSD",
      status: "FRESH",
      ageMs: null,
    });
  },
);

test(
  "negative age is rejected",
  () => {
    expectInvalid({
      symbol: "XAUUSD",
      status: "STALE",
      ageMs: -1,
    });
  },
);

test(
  "fractional age is rejected",
  () => {
    expectInvalid({
      symbol: "XAUUSD",
      status: "STALE",
      ageMs: 5000.5,
    });
  },
);

test(
  "non-object payload is rejected",
  () => {
    expectInvalid("FRESH");
  },
);

test(
  "invalid JSON is rejected",
  () => {
    assert.throws(
      () =>
        parseMarketFreshnessEvent(
          "{invalid-json",
        ),
      SyntaxError,
    );
  },
);

console.log("");
console.log(
  `[PASS] Market Stream Freshness Parser: ${passed}/12 tests`,
);
