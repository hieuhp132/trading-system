import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "./database/prisma.js";
import { getMarketPrice } from "./modules/market/service.js";

import {
  createLimitWorker,
  defaultLimitWorkerDependencies,
  type LimitWorkerDependencies,
} from "./modules/orders/limit-worker.js";

import type { MarketPriceResponse } from "./modules/market/types.js";

const base = (
  process.env.TEST_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

let passed = 0;

function safety(): void {
  if (process.env.MARKET_DATA_PROVIDER !== "demo") {
    throw new Error("MARKET_DATA_PROVIDER must be demo");
  }

  if (process.env.STOP_WORKER_ENABLED !== "false") {
    throw new Error("STOP_WORKER_ENABLED must be false");
  }

  if (process.env.LIMIT_WORKER_ENABLED !== "false") {
    throw new Error("LIMIT_WORKER_ENABLED must be false");
  }

  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error("DATABASE_URL must equal TEST_DATABASE_URL");
  }

  const databaseName = new URL(process.env.DATABASE_URL).pathname.replace(
    /^\//,
    "",
  );

  if (!/(test|testing|e2e)/i.test(databaseName)) {
    throw new Error("Use a dedicated test database");
  }

  const maxAge = Number(process.env.LIMIT_WORKER_MAX_QUOTE_AGE_MS ?? 5000);

  if (!Number.isSafeInteger(maxAge) || maxAge < 100) {
    throw new Error("Invalid LIMIT_WORKER_MAX_QUOTE_AGE_MS");
  }
}

async function api(
  path: string,
  method = "GET",
  token?: string,
  body?: object,
): Promise<any> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await response.json();

  if (!response.ok || !json.success) {
    throw new Error(
      `${method} ${path}: HTTP ${response.status}: ` + JSON.stringify(json),
    );
  }

  return json.data;
}

function makeQuote(bid: number, ask: number): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "limit-worker-integration",
    timestamp: new Date().toISOString(),
  };
}

type Side = "BUY" | "SELL";

async function setup(side: Side) {
  const email = `limit-worker-${randomUUID()}@example.com`;

  const password = "Test@123456";

  await api("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Limit Worker Integration",
  });

  const login = await api("/auth/login", "POST", undefined, {
    email,
    password,
  });

  const token: string = login.accessToken;

  const account = await api("/accounts/demo", "POST", token);

  const user = await db.orm.public.User.where({
    email,
  }).first();

  assert.ok(user, "API and test must use the same database");

  const market = await getMarketPrice("XAUUSD");

  const bid = Number(market.bid);
  const ask = Number(market.ask);

  assert.ok(
    Number.isFinite(bid) && Number.isFinite(ask) && bid > 100 && ask >= bid,
  );

  const limitPrice =
    side === "BUY" ? (bid - 100).toFixed(2) : (ask + 100).toFixed(2);

  const created = await api("/orders", "POST", token, {
    symbol: "XAUUSD",
    side,
    orderType: side === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT",
    quantity: "0.01",
    price: limitPrice,
  });

  assert.equal(created.order.status, "PENDING");

  return {
    userId: user.id,
    accountId: account.id as string,
    orderId: created.order.id as string,
    side,
    limitPrice: Number(limitPrice),
  };
}

type Scenario = Awaited<ReturnType<typeof setup>>;

function quoteFor(scenario: Scenario, triggered: boolean): MarketPriceResponse {
  const price = scenario.limitPrice;

  if (scenario.side === "BUY") {
    return triggered
      ? makeQuote(price - 0.2, price)
      : makeQuote(price + 0.8, price + 1);
  }

  return triggered
    ? makeQuote(price, price + 0.2)
    : makeQuote(price - 1, price - 0.8);
}

async function snapshot(s: Scenario) {
  const [order, account, positions, trades] = await Promise.all([
    db.orm.public.Order.where({
      id: s.orderId,
      accountId: s.accountId,
    }).first(),

    db.orm.public.DemoAccount.where({
      id: s.accountId,
    }).first(),

    db.orm.public.Position.where({
      accountId: s.accountId,
    }).all(),

    db.orm.public.Trade.where({
      accountId: s.accountId,
    }).all(),
  ]);

  assert.ok(order);
  assert.ok(account);

  return {
    order,
    balance: Number(account.balance),
    equity: Number(account.equity),
    positions,
    trades,
  };
}

function createTestWorker(
  accountId: string,
  getQuote: () => Promise<MarketPriceResponse>,
) {
  const errors: Array<{
    error: unknown;
    context: string;
  }> = [];

  const dependencies: LimitWorkerDependencies = {
    async listOrders() {
      // Use the real production query, but isolate this
      // integration test to its own newly created account.
      const orders = await defaultLimitWorkerDependencies.listOrders();

      return orders.filter((order) => order.accountId === accountId);
    },

    getQuote,

    getUserId: defaultLimitWorkerDependencies.getUserId,

    execute: defaultLimitWorkerDependencies.execute,

    logError(error, context) {
      errors.push({ error, context });
    },
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
    maxQuoteAgeMs: Number(process.env.LIMIT_WORKER_MAX_QUOTE_AGE_MS ?? 5000),
  });

  return { worker, errors };
}

function assertNoWorkerErrors(
  errors: Array<{
    error: unknown;
    context: string;
  }>,
): void {
  assert.deepEqual(errors, [], "Worker reported unexpected errors");
}

async function testAutomaticWorker(side: Side): Promise<void> {
  const s = await setup(side);

  const before = await snapshot(s);

  assert.equal(before.order.status, "PENDING");
  assert.equal(before.positions.length, 0);
  assert.equal(before.trades.length, 0);

  let quoteCalls = 0;

  const test = createTestWorker(
    s.accountId,
    async () => {
      quoteCalls++;

      return {
        ...quoteFor(s, true),
        timestamp: new Date().toISOString(),
      };
    },
  );

  let filled = false;

  // Worker must execute through its timer.
  // Do not call worker.tick() manually.
  test.worker.start();

  try {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      if (test.errors.length > 0) {
        throw new Error(
          `Worker error: ${JSON.stringify(
            test.errors.map(({ error, context }) => ({
              context,
              message:
                error instanceof Error
                  ? error.message
                  : String(error),
            })),
          )}`,
        );
      }

      const current = await snapshot(s);

      if (current.order.status === "FILLED") {
        filled = true;
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 25);
      });
    }

    assert.equal(
      filled,
      true,
      `${side}: worker did not fill the order within 5 seconds`,
    );
  } finally {
    // Always stop the worker, including when assertions fail.
    await test.worker.stop();
  }

  assertNoWorkerErrors(test.errors);

  const after = await snapshot(s);

  const expectedQuote = quoteFor(s, true);

  const expectedPrice =
    side === "BUY"
      ? Number(expectedQuote.ask)
      : Number(expectedQuote.bid);

  assert.equal(after.order.status, "FILLED");

  assert.equal(
    Number(after.order.executedPrice),
    expectedPrice,
  );

  assert.ok(after.order.executedAt);

  assert.equal(after.positions.length, 1);
  assert.equal(after.trades.length, 1);

  assert.equal(
    after.trades[0].orderId,
    s.orderId,
  );

  assert.equal(after.balance, before.balance);

  assert.ok(
    quoteCalls >= 1,
    "Worker must request a market quote",
  );

  passed++;

  console.log(
    `[PASS] ${side}: start() automatically fills order`,
  );

  // Verify that stop() prevents future scheduled ticks.
  const callsAfterStop = quoteCalls;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });

  assert.equal(
    quoteCalls,
    callsAfterStop,
    "Worker requested another quote after stop()",
  );

  const final = await snapshot(s);

  assert.equal(final.order.status, "FILLED");
  assert.equal(final.positions.length, 1);
  assert.equal(final.trades.length, 1);

  assertNoWorkerErrors(test.errors);

  passed++;

  console.log(
    `[PASS] ${side}: stop() prevents further execution`,
  );
}

async function testScenario(side: Side) {
  const s = await setup(side);

  const before = await snapshot(s);

  assert.equal(before.order.status, "PENDING");
  assert.equal(before.positions.length, 0);
  assert.equal(before.trades.length, 0);

  // ---------------------------------------------
  // 1. Quote has NOT reached the limit.
  // ---------------------------------------------

  let currentQuote = quoteFor(s, false);

  const test = createTestWorker(s.accountId, async () => ({
    ...currentQuote,
    timestamp: new Date().toISOString(),
  }));

  await test.worker.tick();

  assertNoWorkerErrors(test.errors);

  const waiting = await snapshot(s);

  assert.equal(waiting.order.status, "PENDING");
  assert.equal(waiting.order.executedPrice, null);
  assert.equal(waiting.positions.length, 0);
  assert.equal(waiting.trades.length, 0);
  assert.equal(waiting.balance, before.balance);

  passed++;

  console.log(`[PASS] ${side}: worker leaves untriggered order PENDING`);

  // ---------------------------------------------
  // 2. Quote reaches the limit.
  // ---------------------------------------------

  currentQuote = quoteFor(s, true);

  await test.worker.tick();

  assertNoWorkerErrors(test.errors);

  const filled = await snapshot(s);

  const expectedPrice =
    side === "BUY" ? Number(currentQuote.ask) : Number(currentQuote.bid);

  assert.equal(filled.order.status, "FILLED");

  assert.equal(Number(filled.order.executedPrice), expectedPrice);

  assert.ok(filled.order.executedAt);

  assert.equal(filled.positions.length, 1);
  assert.equal(filled.trades.length, 1);

  assert.equal(filled.trades[0].orderId, s.orderId);

  assert.equal(filled.balance, before.balance);

  passed++;

  console.log(
    `[PASS] ${side}: worker fills order and creates position + trade`,
  );

  // ---------------------------------------------
  // 3. Another tick must not fill it again.
  // ---------------------------------------------

  await test.worker.tick();

  assertNoWorkerErrors(test.errors);

  const repeated = await snapshot(s);

  assert.equal(repeated.order.status, "FILLED");

  assert.equal(repeated.positions.length, filled.positions.length);

  assert.equal(repeated.trades.length, filled.trades.length);

  assert.equal(repeated.balance, filled.balance);

  passed++;

  console.log(`[PASS] ${side}: repeated tick does not duplicate execution`);

  // ---------------------------------------------
  // 4. Simulate worker restart.
  // ---------------------------------------------

  await test.worker.stop();

  const restarted = createTestWorker(s.accountId, async () => ({
    ...currentQuote,
    timestamp: new Date().toISOString(),
  }));

  try {
    await restarted.worker.tick();

    assertNoWorkerErrors(restarted.errors);

    const afterRestart = await snapshot(s);

    assert.equal(afterRestart.order.status, "FILLED");

    assert.equal(afterRestart.positions.length, filled.positions.length);

    assert.equal(afterRestart.trades.length, filled.trades.length);

    passed++;

    console.log(`[PASS] ${side}: restart does not duplicate execution`);
  } finally {
    await restarted.worker.stop();
  }
}

async function main(): Promise<void> {
  safety();

  console.log(
    "Testing Limit Worker on isolated database",
  );

  // B.10.4: Manual tick integration.
  await testScenario("BUY");
  await testScenario("SELL");

  // B.10.5: Automatic timer integration.
  await testAutomaticWorker("BUY");
  await testAutomaticWorker("SELL");

  console.log(
    `RESULT: passed=${passed} failed=0`,
  );
}




main().catch((error) => {
  console.error("[FAIL]", error);

  console.error(`RESULT: passed=${passed} failed=1`);

  process.exitCode = 1;
});
