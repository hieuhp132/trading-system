import assert from "node:assert/strict";

import {
  createLimitWorker,
  type LimitWorkerDependencies,
} from "./modules/orders/limit-worker.js";

async function main(): Promise<void> {
  let passed = 0;
  let currentTime = 1_000_000;
  let executionCount = 0;

  const dependencies: LimitWorkerDependencies = {
    async listOrders() {
      return [
        {
          id: "order-1",
          accountId: "account-1",
          orderType: "BUY_LIMIT" as const,
          requestedPrice: "4000.00",
        },
      ];
    },

    async getQuote() {
      return {
        symbol: "XAUUSD",
        bid: "3899.80",
        ask: "3900.00",
        last: "3899.90",
        source: "demo",
        timestamp: new Date().toISOString(),
      };
    },

    async getUserId() {
      return "user-1";
    },

    async execute() {
      executionCount++;

      throw Object.assign(new Error("Insufficient margin"), {
        code: "INSUFFICIENT_MARGIN",
      });
    },

    logError() {},
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
    maxQuoteAgeMs: 5000,
    now: () => currentTime,
  });

  try {
    // First attempt: execution fails and cooldown starts.
    await worker.tick();

    assert.equal(executionCount, 1);

    passed++;
    console.log("[PASS] First attempt starts cooldown");

    // One millisecond before expiry.
    currentTime += 29_999;

    await worker.tick();

    assert.equal(executionCount, 1);

    passed++;
    console.log("[PASS] Order is skipped before cooldown expiry");

    // Exactly at expiry.
    currentTime += 1;

    await worker.tick();

    assert.equal(executionCount, 2);

    passed++;
    console.log("[PASS] Order retries exactly at cooldown expiry");

    // The failed retry must start another cooldown.
    await worker.tick();

    assert.equal(executionCount, 2);

    passed++;
    console.log("[PASS] Failed retry starts a new cooldown");

    // Advance another full cooldown period.
    currentTime += 30_000;

    await worker.tick();

    assert.equal(executionCount, 3);

    passed++;
    console.log("[PASS] Order retries after second cooldown");
  } finally {
    await worker.stop();
  }

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  process.exitCode = 1;
});
