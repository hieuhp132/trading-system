import assert from "node:assert/strict";

import {
  createLimitWorker,
  type LimitWorkerDependencies,
  type LimitWorkerOrder,
} from "../modules/orders/limit-worker.js";

import type { MarketPriceResponse } from "../modules/market/types.js";

async function main(): Promise<void> {
  let passed = 0;

  const first: LimitWorkerOrder = {
    id: "order-first",
    accountId: "account-1",
    orderType: "BUY_LIMIT",
    requestedPrice: "4000.00",
  };

  const second: LimitWorkerOrder = {
    id: "order-second",
    accountId: "account-2",
    orderType: "BUY_LIMIT",
    requestedPrice: "4000.00",
  };

  let orders: LimitWorkerOrder[] = [first, second];

  const executionCount = new Map<string, number>();

  const errors: string[] = [];

  let quoteCalls = 0;

  const dependencies: LimitWorkerDependencies = {
    async listOrders() {
      return orders;
    },

    async getQuote(): Promise<MarketPriceResponse> {
      quoteCalls++;

      return {
        symbol: "XAUUSD",
        bid: "3899.80",
        ask: "3900.00",
        last: "3899.90",
        source: "demo",
        timestamp: new Date().toISOString(),
      };
    },

    async getUserId(accountId) {
      return `user-${accountId}`;
    },

    async execute(_userId, orderId) {
      executionCount.set(orderId, (executionCount.get(orderId) ?? 0) + 1);

      if (orderId === first.id) {
        throw Object.assign(new Error("Insufficient margin"), {
          code: "INSUFFICIENT_MARGIN",
        });
      }

      return { status: "FILLED" };
    },

    logError(_error, context) {
      errors.push(context);
    },
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
    maxQuoteAgeMs: 5000,
  });

  try {
    // TEST 1: First order fails, second still executes.
    await worker.tick();

    assert.equal(executionCount.get(first.id), 1);
    assert.equal(executionCount.get(second.id), 1);

    assert.equal(errors.length, 1);
    assert.match(errors[0], /action=DEFER/);
    assert.match(errors[0], /retryDelayMs=30000/);

    passed++;
    console.log("[PASS] Failed order enters cooldown; other order executes");

    // TEST 2: A subsequent tick must skip the failed order.
    await worker.tick();

    assert.equal(executionCount.get(first.id), 1);

    passed++;
    console.log("[PASS] Order in cooldown is not executed again");

    // TEST 3: Skipping the failed order must not block others.
    assert.equal(executionCount.get(second.id), 2);

    passed++;
    console.log("[PASS] Other orders continue executing during cooldown");

    // TEST 4: Remove the failed order from the pending list.
    // The worker should clear its stale cooldown entry.
    orders = [second];

    await worker.tick();

    assert.equal(executionCount.get(first.id), 1);

    passed++;
    console.log("[PASS] Removed pending order is no longer processed");

    // TEST 5: Reintroducing the order must allow a new attempt.
    // This verifies cleanup of the old cooldown entry.
    orders = [first, second];

    await worker.tick();

    assert.equal(executionCount.get(first.id), 2);

    passed++;
    console.log(
      "[PASS] Cooldown entry is cleared when order leaves pending list",
    );

    // TEST 6: If every pending order is cooling down,
    // no market quote should be requested.
    orders = [first];

    const previousQuoteCalls = quoteCalls;

    await worker.tick();

    assert.equal(quoteCalls, previousQuoteCalls);

    passed++;
    console.log("[PASS] All-cooldown queue skips market request");
  } finally {
    await worker.stop();
  }

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  process.exitCode = 1;
});
