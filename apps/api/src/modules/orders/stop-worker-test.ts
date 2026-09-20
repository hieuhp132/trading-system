import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { createStopWorker, validateWorkerQuote, type StopWorkerDependencies } from "./stop-worker.js";
import type { MarketPriceResponse } from "../market/types.js";

function quote(bid = 100, ask = 101, timestamp = new Date().toISOString()): MarketPriceResponse {
  return { symbol: "XAUUSD", bid: bid.toFixed(2), ask: ask.toFixed(2), last: "100.50", source: "test", timestamp };
}
function mock(overrides: Partial<StopWorkerDependencies> = {}) {
  const executed: string[] = [];
  const errors: string[] = [];
  const deps: StopWorkerDependencies = {
    listPositions: async () => [{ id: "p1", accountId: "a1", side: "LONG", stopLoss: "100.00", takeProfit: null }],
    getQuote: async () => quote(),
    getUserId: async () => "u1",
    execute: async (_userId, positionId) => { executed.push(positionId); },
    logError: (_error, context) => { errors.push(context); },
    ...overrides,
  };
  return { deps, executed, errors };
}

test("valid quote accepted", () => assert.doesNotThrow(() => validateWorkerQuote(quote(), 5000)));
test("stale quote rejected", () => assert.throws(() => validateWorkerQuote(quote(100, 101, new Date(Date.now() - 6000).toISOString()), 5000)));
test("future timestamp rejected", () => assert.throws(() => validateWorkerQuote(quote(100, 101, new Date(Date.now() + 6000).toISOString()), 5000)));
test("invalid spread rejected", () => assert.throws(() => validateWorkerQuote(quote(102, 101), 5000)));
test("wrong symbol rejected", () => assert.throws(() => validateWorkerQuote({ ...quote(), symbol: "EURUSD" }, 5000)));
test("trigger executes once", async () => {
  const m = mock();
  await createStopWorker(m.deps).tick();
  assert.deepEqual(m.executed, ["p1"]);
  assert.deepEqual(m.errors, []);
});
test("no trigger does not execute", async () => {
  const m = mock({ getQuote: async () => quote(105, 106) });
  await createStopWorker(m.deps).tick();
  assert.deepEqual(m.executed, []);
});
test("provider failure does not execute", async () => {
  const m = mock({ getQuote: async () => { throw new Error("provider unavailable"); } });
  await createStopWorker(m.deps).tick();
  assert.deepEqual(m.executed, []);
  assert.deepEqual(m.errors, ["tick"]);
});
test("position error does not block next position", async () => {
  const m = mock({
    listPositions: async () => ["p1", "p2"].map(id => ({ id, accountId: "a1", side: "LONG" as const, stopLoss: "100.00", takeProfit: null })),
    execute: async (_userId, positionId) => {
      if (positionId === "p1") throw new Error("first failed");
      m.executed.push(positionId);
    },
  });
  await createStopWorker(m.deps).tick();
  assert.deepEqual(m.executed, ["p2"]);
  assert.deepEqual(m.errors, ["position=p1"]);
});
test("overlapping ticks do not duplicate execution", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const m = mock({ execute: async () => { calls++; await gate; } });
  const worker = createStopWorker(m.deps);
  const first = worker.tick();
  const second = worker.tick();
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});
