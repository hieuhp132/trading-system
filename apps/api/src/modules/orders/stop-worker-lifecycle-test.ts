import assert from "node:assert/strict";
import { test } from "node:test";

import { createStopWorker } from "./stop-worker.js";
import type { StopWorkerDependencies } from "./stop-worker.js";
import type { MarketPriceResponse } from "../market/types.js";

const quote: MarketPriceResponse = {
  symbol: "XAUUSD",
  bid: "3651.20",
  ask: "3651.40",
  last: "3651.30",
  source: "demo",
  timestamp: new Date().toISOString(),
};

const position = {
  id: "test-position",
  accountId: "test-account",
  side: "LONG" as const,
  stopLoss: "3651.30",
  takeProfit: null,
};

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

async function waitUntil(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for worker state");
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function makeDependencies(
  overrides: Partial<StopWorkerDependencies> = {},
): StopWorkerDependencies {
  return {
    listPositions: async () => [position],
    getQuote: async () => ({
      ...quote,
      timestamp: new Date().toISOString(),
    }),
    getUserId: async () => "test-user",
    execute: async () => undefined,
    logError: (error, context) => {
      throw new Error(`${context}: ${String(error)}`);
    },
    ...overrides,
  };
}

test("scheduler runs automatically without overlapping ticks", async () => {
  const gate = deferred();

  let listCalls = 0;
  let quoteStarted = false;

  const worker = createStopWorker(
    makeDependencies({
      listPositions: async () => {
        listCalls++;
        return [position];
      },
      getQuote: async () => {
        quoteStarted = true;
        await gate.promise;

        return {
          ...quote,
          timestamp: new Date().toISOString(),
        };
      },
    }),
    { intervalMs: 100 },
  );

  try {
    worker.start();

    await waitUntil(() => quoteStarted);

    // The first tick is blocked inside getQuote().
    // No second tick should begin during this time.
    await new Promise((resolve) => setTimeout(resolve, 250));

    assert.equal(listCalls, 1);

    gate.resolve();
    await worker.stop();

    const callsAfterStop = listCalls;

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(listCalls, callsAfterStop);
  } finally {
    gate.resolve();
    await worker.stop();
  }
});

test("stop waits for an active execution and prevents new ticks", async () => {
  const gate = deferred();

  let executionStarted = false;
  let executionFinished = false;
  let stopFinished = false;
  let listCalls = 0;

  const worker = createStopWorker(
    makeDependencies({
      listPositions: async () => {
        listCalls++;
        return [position];
      },
      execute: async () => {
        executionStarted = true;
        await gate.promise;
        executionFinished = true;
      },
    }),
    { intervalMs: 100 },
  );

  try {
    worker.start();

    await waitUntil(() => executionStarted);

    const stopping = worker.stop().then(() => {
      stopFinished = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(stopFinished, false);
    assert.equal(executionFinished, false);

    gate.resolve();

    await stopping;

    assert.equal(executionFinished, true);
    assert.equal(stopFinished, true);

    const callsAfterStop = listCalls;

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(listCalls, callsAfterStop);
  } finally {
    gate.resolve();
    await worker.stop();
  }
});
