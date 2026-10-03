import assert from "node:assert/strict";

import type {
  ReferenceQuote,
} from "./quote-contract.js";

import type {
  ReferenceQuoteStream,
  ReferenceQuoteStreamHandlers,
} from "./reference-quote-stream.js";

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

const quote: ReferenceQuote = {
  symbol: "XAUUSD",
  bid: "3651.20",
  ask: "3651.40",
  last: "3651.30",
  source: "test-stream",
  sourceTimestamp: null,
  receivedAt: "2026-09-25T00:00:00.000Z",
  bidAskType: "SYNTHETIC",
  executionCapability: "NONE",
};

let receivedQuote:
  | ReferenceQuote
  | null = null;

let receivedError:
  | unknown
  | null = null;

const handlers: ReferenceQuoteStreamHandlers = {
  onQuote(value) {
    receivedQuote = value;
  },

  onError(error) {
    receivedError = error;
  },
};

handlers.onQuote(quote);

assert.equal(
  receivedQuote,
  quote,
);

pass(
  "onQuote accepts canonical ReferenceQuote",
);

const error =
  new Error("stream failure");

handlers.onError?.(error);

assert.equal(
  receivedError,
  error,
);

pass(
  "optional onError accepts unknown failures",
);

let running = false;

const stream: ReferenceQuoteStream = {
  start(currentHandlers) {
    running = true;

    currentHandlers.onQuote(quote);
  },

  async stop() {
    running = false;
  },

  isRunning() {
    return running;
  },
};

assert.equal(
  stream.isRunning(),
  false,
);

pass(
  "stream starts stopped",
);

stream.start(handlers);

assert.equal(
  stream.isRunning(),
  true,
);

pass(
  "start activates stream",
);

assert.equal(
  receivedQuote,
  quote,
);

pass(
  "start can deliver ReferenceQuote through handler",
);

await stream.stop();

assert.equal(
  stream.isRunning(),
  false,
);

pass(
  "stop deactivates stream asynchronously",
);

/*
 * Contract deliberately contains no execution API.
 *
 * Realtime reference delivery must not expose a trading
 * quote getter or execution capability boundary.
 */
assert.equal(
  "getTradingQuote" in stream,
  false,
);

assert.equal(
  "execute" in stream,
  false,
);

pass(
  "reference stream exposes no execution operation",
);

console.log("");
console.log(
  `[PASS] Reference Quote Stream Contract: ${passed}/7 tests`,
);
