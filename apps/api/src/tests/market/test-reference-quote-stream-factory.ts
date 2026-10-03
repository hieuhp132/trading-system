import assert from "node:assert/strict";

import {
  createReferenceQuoteStream,
  supportsReferenceQuoteStream,
} from "./reference-quote-stream-factory.js";

import type {
  ReferenceQuoteStream,
} from "./reference-quote-stream.js";

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

const stream: ReferenceQuoteStream = {
  start() {
    // Contract stub.
  },

  async stop() {
    // Contract stub.
  },

  isRunning() {
    return false;
  },
};

/*
 * Provider without streaming capability.
 */
const pollingOnlyProvider = {
  async getPrice() {
    return {};
  },

  async getCandles() {
    return {};
  },
};

assert.equal(
  supportsReferenceQuoteStream(
    pollingOnlyProvider,
  ),
  false,
);

pass(
  "polling-only provider does not advertise stream capability",
);

assert.equal(
  createReferenceQuoteStream(
    pollingOnlyProvider,
  ),
  null,
);

pass(
  "polling-only provider resolves to null stream",
);

/*
 * Provider with optional reference-stream capability.
 */
let createCalls = 0;

const streamingProvider = {
  createReferenceQuoteStream() {
    createCalls += 1;
    return stream;
  },
};

assert.equal(
  supportsReferenceQuoteStream(
    streamingProvider,
  ),
  true,
);

pass(
  "streaming provider advertises stream capability",
);

assert.equal(
  createReferenceQuoteStream(
    streamingProvider,
  ),
  stream,
);

assert.equal(
  createCalls,
  1,
);

pass(
  "factory returns provider-created reference stream",
);

/*
 * Invalid values must fail closed.
 */
for (const value of [
  null,
  undefined,
  "provider",
  123,
  {},
  {
    createReferenceQuoteStream: true,
  },
]) {
  assert.equal(
    supportsReferenceQuoteStream(value),
    false,
  );

  assert.equal(
    createReferenceQuoteStream(value),
    null,
  );
}

pass(
  "invalid capability shapes fail closed",
);

/*
 * Factory must not start the stream implicitly.
 *
 * Lifecycle remains the responsibility of the service/main
 * integration layer.
 */
let startCalls = 0;

const lifecycleStream: ReferenceQuoteStream = {
  start() {
    startCalls += 1;
  },

  async stop() {
    // Contract stub.
  },

  isRunning() {
    return false;
  },
};

const lifecycleProvider = {
  createReferenceQuoteStream() {
    return lifecycleStream;
  },
};

const created =
  createReferenceQuoteStream(
    lifecycleProvider,
  );

assert.equal(
  created,
  lifecycleStream,
);

assert.equal(
  startCalls,
  0,
);

pass(
  "factory does not start stream implicitly",
);

/*
 * No execution API is introduced by the capability contract.
 */
assert.equal(
  "getTradingQuote" in streamingProvider,
  false,
);

assert.equal(
  "execute" in streamingProvider,
  false,
);

pass(
  "stream capability exposes no execution operation",
);

console.log("");
console.log(
  `[PASS] Reference Quote Stream Factory: ${passed}/7 tests`,
);
