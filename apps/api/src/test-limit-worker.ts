import assert from "node:assert/strict";

import {
  createLimitWorker,
  type LimitWorkerDependencies,
  type LimitWorkerOrder,
} from "./modules/orders/limit-worker.js";

import type { MarketPriceResponse } from "./modules/market/types.js";

let passed = 0;

function quote(bid: number, ask: number): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "unit-test",
    timestamp: new Date().toISOString(),
  };
}

function order(
  id: string,
  orderType: "BUY_LIMIT" | "SELL_LIMIT",
  requestedPrice: string,
): LimitWorkerOrder {
  return {
    id,
    accountId: `account-${id}`,
    orderType,
    requestedPrice,
  };
}

function createDependencies(
  orders: LimitWorkerOrder[],
  marketQuote: MarketPriceResponse,
) {
  const executed: string[] = [];
  const errors: string[] = [];

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => orders,

    getQuote: async () => marketQuote,

    getUserId: async (accountId) => `user-${accountId}`,

    execute: async (_userId, orderId) => {
      executed.push(orderId);
    },

    logError: (_error, context) => {
      errors.push(context);
    },
  };

  return {
    dependencies,
    executed,
    errors,
  };
}

async function testOnlyTriggeredOrders() {
  const test = createDependencies(
    [
      order("buy-triggered", "BUY_LIMIT", "3651.40"),
      order("buy-waiting", "BUY_LIMIT", "3650.00"),
      order("sell-triggered", "SELL_LIMIT", "3651.20"),
      order("sell-waiting", "SELL_LIMIT", "3652.00"),
    ],
    quote(3651.2, 3651.4),
  );

  const worker = createLimitWorker(test.dependencies);

  await worker.tick();

  assert.deepEqual(test.executed, ["buy-triggered", "sell-triggered"]);

  assert.deepEqual(test.errors, []);

  passed++;
  console.log("[PASS] Only triggered orders execute");
}

async function testOrderFailureIsolation() {
  const executed: string[] = [];
  const errors: string[] = [];

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => [
      order("first", "BUY_LIMIT", "3651.40"),
      order("second", "BUY_LIMIT", "3651.40"),
    ],

    getQuote: async () => quote(3651.2, 3651.4),

    getUserId: async () => "user-1",

    execute: async (_userId, orderId) => {
      executed.push(orderId);

      if (orderId === "first") {
        throw new Error("Simulated execution failure");
      }
    },

    logError: (_error, context) => {
      errors.push(context);
    },
  };

  const worker = createLimitWorker(dependencies);

  await worker.tick();

  assert.deepEqual(executed, ["first", "second"]);
  assert.deepEqual(errors, [
    "order=first action=INVESTIGATE retryDelayMs=30000",
  ]);
  passed++;
  console.log("[PASS] One failed order does not block others");
}

async function testNoOverlappingTicks() {
  let release!: () => void;
  let signalStarted!: () => void;

  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });

  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });

  let listCalls = 0;

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => {
      listCalls++;
      signalStarted();
      await blocked;
      return [];
    },

    getQuote: async () => quote(3651.2, 3651.4),

    getUserId: async () => "user-1",

    execute: async () => undefined,

    logError: (error) => {
      throw error;
    },
  };

  const worker = createLimitWorker(dependencies);

  const firstTick = worker.tick();

  try {
    await started;

    // The second tick must return without calling listOrders.
    await worker.tick();

    assert.equal(listCalls, 1);
  } finally {
    release();
    await firstTick;
  }

  passed++;
  console.log("[PASS] Overlapping ticks are prevented");
}

async function testEmptyQueue() {
  let quoteCalls = 0;

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => [],

    getQuote: async () => {
      quoteCalls++;
      return quote(3651.2, 3651.4);
    },

    getUserId: async () => "user-1",

    execute: async () => undefined,

    logError: (error) => {
      throw error;
    },
  };

  const worker = createLimitWorker(dependencies);

  await worker.tick();

  assert.equal(quoteCalls, 0);

  passed++;
  console.log("[PASS] Empty queue skips market request");
}

async function testStartAndStop() {
  let listCalls = 0;

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => {
      listCalls++;
      return [];
    },
    getQuote: async () => quote(3651.2, 3651.4),
    getUserId: async () => "user-1",
    execute: async () => undefined,
    logError: (error) => {
      throw error;
    },
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
  });

  worker.start();
  worker.start(); // Must not create a second timer.

  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350);
    });
  } finally {
    await worker.stop();
  }

  const callsAfterStop = listCalls;

  assert.ok(callsAfterStop >= 1, "Worker should execute at least one tick");

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 250);
  });

  assert.equal(
    listCalls,
    callsAfterStop,
    "Worker must not schedule ticks after stop",
  );

  passed++;
  console.log("[PASS] start/stop lifecycle");
}

async function testStopWaitsForActiveTick() {
  let signalStarted!: () => void;
  let releaseTick!: () => void;

  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });

  const blocked = new Promise<void>((resolve) => {
    releaseTick = resolve;
  });

  let completed = false;

  const dependencies: LimitWorkerDependencies = {
    listOrders: async () => {
      signalStarted();
      await blocked;
      completed = true;
      return [];
    },
    getQuote: async () => quote(3651.2, 3651.4),
    getUserId: async () => "user-1",
    execute: async () => undefined,
    logError: (error) => {
      throw error;
    },
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
  });

  worker.start();

  try {
    await started;

    let stopResolved = false;

    const stopping = worker.stop().then(() => {
      stopResolved = true;
    });

    // Allow Promise callbacks to run.
    await Promise.resolve();

    assert.equal(stopResolved, false, "stop() must wait for the active tick");

    releaseTick();

    await stopping;

    assert.equal(completed, true);
    assert.equal(stopResolved, true);
  } finally {
    releaseTick();
    await worker.stop();
  }

  passed++;
  console.log("[PASS] stop waits for active tick");
}

async function main() {
  await testOnlyTriggeredOrders();
  await testOrderFailureIsolation();
  await testNoOverlappingTicks();
  await testEmptyQueue();
  await testStartAndStop();
  await testStopWaitsForActiveTick();

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
