import assert from "node:assert/strict";

import type { MarketPriceResponse } from "../market/types.js";

import {
  createStopOutWorker,
  type StopOutWorkerDependencies,
  type StopOutWorkerPosition,
} from "./stop-out-worker.js";

let passed = 0;
let total = 0;

async function test(
  name: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  total += 1;

  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

const NOW =
  Date.parse(
    "2026-09-23T12:00:00.000Z",
  );

function quote(
  overrides:
    Partial<MarketPriceResponse> = {},
): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: "100.00",
    ask: "101.00",
    last: "100.50",
    source: "unit-test",
    timestamp:
      "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function position(
  overrides:
    Partial<StopOutWorkerPosition> & {
      id: string;
      accountId: string;
    },
): StopOutWorkerPosition {
  return {
    id: overrides.id,
    accountId: overrides.accountId,
    side:
      overrides.side ?? "LONG",
    quantity:
      overrides.quantity ?? 1,
    entryPrice:
      overrides.entryPrice ?? 100,
    openedAt:
      overrides.openedAt ??
      "2026-01-01T00:00:00.000Z",
  };
}

function dependencies(
  overrides:
    Partial<StopOutWorkerDependencies> = {},
): StopOutWorkerDependencies {
  return {
    async listPositions() {
      return [];
    },

    async getQuote() {
      return quote();
    },

    async getUserId(accountId) {
      return `user-${accountId}`;
    },

    async execute() {
      return { closed: true };
    },

    logError() {},

    ...overrides,
  };
}

await test(
  "no positions => no quote and no execution",
  async () => {
    let quoteCalls = 0;
    let executeCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async getQuote() {
            quoteCalls += 1;
            return quote();
          },

          async execute() {
            executeCalls += 1;
            return {};
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.equal(quoteCalls, 0);
    assert.equal(executeCalls, 0);
  },
);

await test(
  "positions are liquidated largest loss first",
  async () => {
    const executed: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "small-loss",
                accountId: "a1",
                entryPrice: 101,
              }),
              position({
                id: "large-loss",
                accountId: "a1",
                entryPrice: 110,
              }),
              position({
                id: "profit",
                accountId: "a1",
                entryPrice: 90,
              }),
            ];
          },

          async execute(
            _userId,
            positionId,
          ) {
            executed.push(positionId);
            return { closed: true };
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.deepEqual(
      executed,
      [
        "large-loss",
        "small-loss",
        "profit",
      ],
    );
  },
);

await test(
  "null execution stops liquidation for that account",
  async () => {
    const executed: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "first",
                accountId: "a1",
                entryPrice: 110,
              }),
              position({
                id: "second",
                accountId: "a1",
                entryPrice: 105,
              }),
            ];
          },

          async execute(
            _userId,
            positionId,
          ) {
            executed.push(positionId);
            return null;
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.deepEqual(
      executed,
      ["first"],
    );
  },
);

await test(
  "accounts are processed independently",
  async () => {
    const executed: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "a1-first",
                accountId: "a1",
                entryPrice: 110,
              }),
              position({
                id: "a1-second",
                accountId: "a1",
                entryPrice: 105,
              }),
              position({
                id: "a2-position",
                accountId: "a2",
                entryPrice: 110,
              }),
            ];
          },

          async execute(
            _userId,
            positionId,
          ) {
            executed.push(positionId);

            if (
              positionId ===
              "a1-first"
            ) {
              return null;
            }

            return { closed: true };
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.deepEqual(
      executed,
      [
        "a1-first",
        "a2-position",
      ],
    );
  },
);

await test(
  "missing account user logs error and continues next account",
  async () => {
    const executed: string[] = [];
    const errors: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "missing",
                accountId: "a1",
              }),
              position({
                id: "valid",
                accountId: "a2",
              }),
            ];
          },

          async getUserId(accountId) {
            return accountId === "a1"
              ? null
              : "user-a2";
          },

          async execute(
            _userId,
            positionId,
          ) {
            executed.push(positionId);
            return {};
          },

          logError(
            _error,
            context,
          ) {
            errors.push(context);
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.deepEqual(
      executed,
      ["valid"],
    );

    assert.deepEqual(
      errors,
      ["account=a1"],
    );
  },
);

await test(
  "stale quote fails closed before execution",
  async () => {
    let executeCalls = 0;
    const errors: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "p1",
                accountId: "a1",
              }),
            ];
          },

          async getQuote() {
            return quote({
              timestamp:
                "2026-09-23T11:59:50.000Z",
            });
          },

          async execute() {
            executeCalls += 1;
            return {};
          },

          logError(
            _error,
            context,
          ) {
            errors.push(context);
          },
        }),
        {
          maxQuoteAgeMs: 5000,
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.equal(executeCalls, 0);

    assert.deepEqual(
      errors,
      ["tick"],
    );
  },
);

await test(
  "invalid quote symbol fails closed",
  async () => {
    let executeCalls = 0;

    const errors: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "p1",
                accountId: "a1",
              }),
            ];
          },

          async getQuote() {
            return quote({
              symbol: "EURUSD",
            });
          },

          async execute() {
            executeCalls += 1;
            return {};
          },

          logError(
            _error,
            context,
          ) {
            errors.push(context);
          },
        }),
        {
          now: () => NOW,
        },
      );

    await worker.tick();

    assert.equal(executeCalls, 0);

    assert.deepEqual(
      errors,
      ["tick"],
    );
  },
);

await test(
  "overlapping tick is ignored",
  async () => {
    let release:
      (() => void) | undefined;

    let listCalls = 0;

    const blocked =
      new Promise<void>(
        (resolve) => {
          release = resolve;
        },
      );

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;

            await blocked;

            return [];
          },
        }),
        {
          now: () => NOW,
        },
      );

    const first =
      worker.tick();

    const second =
      worker.tick();

    release?.();

    await Promise.all([
      first,
      second,
    ]);

    assert.equal(listCalls, 1);
  },
);

await test(
  "quote freshness is rechecked before later execution",
  async () => {
    let currentNow = NOW;

    const executed: string[] = [];
    const errors: string[] = [];

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            return [
              position({
                id: "first",
                accountId: "a1",
                entryPrice: 110,
              }),
              position({
                id: "second",
                accountId: "a1",
                entryPrice: 105,
              }),
            ];
          },

          async execute(
            _userId,
            positionId,
          ) {
            executed.push(positionId);

            currentNow += 6000;

            return {};
          },

          logError(
            _error,
            context,
          ) {
            errors.push(context);
          },
        }),
        {
          maxQuoteAgeMs: 5000,
          now: () => currentNow,
        },
      );

    await worker.tick();

    assert.deepEqual(
      executed,
      ["first"],
    );

    assert.deepEqual(
      errors,
      ["account=a1"],
    );
  },
);

await test(
  "invalid worker options are rejected",
  () => {
    assert.throws(
      () =>
        createStopOutWorker(
          dependencies(),
          {
            intervalMs: 99,
          },
        ),
      /STOP_OUT_WORKER_INTERVAL_MS/,
    );

    assert.throws(
      () =>
        createStopOutWorker(
          dependencies(),
          {
            maxQuoteAgeMs: 99,
          },
        ),
      /STOP_OUT_WORKER_MAX_QUOTE_AGE_MS/,
    );
  },
);

console.log(
  `\n[PASS] Stop-Out Worker: ${passed}/${total} tests`,
);

if (passed !== total) {
  process.exit(1);
}