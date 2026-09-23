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

const maxQuoteAgeMs = Number(process.env.LIMIT_WORKER_MAX_QUOTE_AGE_MS ?? 5000);

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

  if (!Number.isSafeInteger(maxQuoteAgeMs) || maxQuoteAgeMs < 100) {
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
      `${method} ${path}: HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  }

  return json.data;
}

async function setup() {
  const email = `limit-safety-${randomUUID()}@example.com`;
  const password = "Test@123456";

  await api("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Limit Worker Safety Integration",
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

  const limitPrice = (bid - 100).toFixed(2);

  const created = await api("/orders", "POST", token, {
    symbol: "XAUUSD",
    side: "BUY",
    orderType: "BUY_LIMIT",
    quantity: "0.01",
    price: limitPrice,
  });

  assert.equal(created.order.status, "PENDING");

  return {
    userId: user.id,
    accountId: account.id as string,
    orderId: created.order.id as string,
    limitPrice: Number(limitPrice),
  };
}

type Scenario = Awaited<ReturnType<typeof setup>>;

function makeQuote(ask: number): MarketPriceResponse {
  const bid = ask - 0.2;

  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "limit-worker-safety-integration",
    timestamp: new Date().toISOString(),
  };
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

function makeWorker(
  accountIds: string[],
  getQuote: () => Promise<MarketPriceResponse>,
  onExecute?: (orderId: string) => void,
) {
  const allowed = new Set(accountIds);

  const errors: Array<{
    error: unknown;
    context: string;
  }> = [];

  const dependencies: LimitWorkerDependencies = {
    async listOrders() {
      const orders = await defaultLimitWorkerDependencies.listOrders();

      return orders.filter((order) => allowed.has(order.accountId));
    },

    getQuote,

    getUserId: defaultLimitWorkerDependencies.getUserId,

    async execute(userId, orderId, quote) {
      onExecute?.(orderId);

      return defaultLimitWorkerDependencies.execute(userId, orderId, quote);
    },

    logError(error, context) {
      errors.push({ error, context });
    },
  };

  const worker = createLimitWorker(dependencies, {
    intervalMs: 100,
    maxQuoteAgeMs,
  });

  return { worker, errors };
}

async function testMarginIsolationAndCooldown(): Promise<void> {
  const blocked = await setup();
  const valid = await setup();

  // Both BUY_LIMIT orders must trigger with the same quote.
  const executionPrice = Math.min(blocked.limitPrice, valid.limitPrice);

  // Only modify the newly created test account.
  const updated = await db.orm.public.DemoAccount.where({
    id: blocked.accountId,
  }).update({
    balance: "0.00",
    equity: "0.00",
  });

  assert.ok(updated);

  const blockedBefore = await snapshot(blocked);
  const validBefore = await snapshot(valid);

  assert.equal(blockedBefore.order.status, "PENDING");
  assert.equal(validBefore.order.status, "PENDING");

  assert.equal(blockedBefore.positions.length, 0);
  assert.equal(blockedBefore.trades.length, 0);

  assert.equal(validBefore.positions.length, 0);
  assert.equal(validBefore.trades.length, 0);

  const attempts = new Map<string, number>();

  const test = makeWorker(
    [blocked.accountId, valid.accountId],
    async () => makeQuote(executionPrice),
    (orderId) => {
      attempts.set(orderId, (attempts.get(orderId) ?? 0) + 1);
    },
  );

  try {
    // Tick 1: blocked order fails; valid order must fill.
    await test.worker.tick();

    assert.equal(attempts.get(blocked.orderId), 1);
    assert.equal(attempts.get(valid.orderId), 1);

    assert.equal(test.errors.length, 1);

    const failure = test.errors[0];

    assert.equal(
      (failure.error as { code?: string }).code,
      "INSUFFICIENT_MARGIN",
    );

    assert.match(failure.context, /action=DEFER/);

    const blockedAfter = await snapshot(blocked);
    const validAfter = await snapshot(valid);

    assert.equal(blockedAfter.order.status, "PENDING");
    assert.equal(blockedAfter.order.executedPrice, null);
    assert.equal(blockedAfter.order.executedAt, null);

    assert.equal(blockedAfter.positions.length, 0);
    assert.equal(blockedAfter.trades.length, 0);

    assert.equal(blockedAfter.balance, blockedBefore.balance);

    assert.equal(blockedAfter.equity, blockedBefore.equity);

    passed++;
    console.log(
      "[PASS] Insufficient margin leaves Order PENDING without DB writes",
    );

    assert.equal(validAfter.order.status, "FILLED");
    assert.equal(validAfter.positions.length, 1);
    assert.equal(validAfter.trades.length, 1);

    assert.equal(validAfter.trades[0].orderId, valid.orderId);

    passed++;
    console.log("[PASS] Valid order fills despite another order failing");

    // Tick 2: blocked order is still pending but cooling down.
    await test.worker.tick();

    assert.equal(attempts.get(blocked.orderId), 1);
    assert.equal(attempts.get(valid.orderId), 1);
    assert.equal(test.errors.length, 1);

    const blockedRepeated = await snapshot(blocked);
    const validRepeated = await snapshot(valid);

    assert.equal(blockedRepeated.order.status, "PENDING");
    assert.equal(blockedRepeated.positions.length, 0);
    assert.equal(blockedRepeated.trades.length, 0);

    assert.equal(validRepeated.order.status, "FILLED");
    assert.equal(validRepeated.positions.length, 1);
    assert.equal(validRepeated.trades.length, 1);

    passed++;
    console.log(
      "[PASS] Cooldown prevents retry and filled order is not duplicated",
    );
  } finally {
    await test.worker.stop();
  }
}

async function testTwoWorkersSameOrder(): Promise<void> {
  const s = await setup();

  const quote = async (): Promise<MarketPriceResponse> =>
    makeQuote(s.limitPrice);
  const first = makeWorker([s.accountId], quote);
  const second = makeWorker([s.accountId], quote);

  try {
    // Two separate worker instances target the same real DB order.
    await Promise.all([first.worker.tick(), second.worker.tick()]);

    assert.deepEqual(first.errors, []);
    assert.deepEqual(second.errors, []);

    const after = await snapshot(s);

    assert.equal(after.order.status, "FILLED");
    assert.equal(after.positions.length, 1);
    assert.equal(after.trades.length, 1);

    assert.equal(after.trades[0].orderId, s.orderId);

    passed++;
    console.log("[PASS] Two workers fill the same order exactly once");

    // Both workers must also remain safe on subsequent ticks.
    await Promise.all([first.worker.tick(), second.worker.tick()]);

    const repeated = await snapshot(s);

    assert.equal(repeated.order.status, "FILLED");
    assert.equal(repeated.positions.length, 1);
    assert.equal(repeated.trades.length, 1);

    passed++;
    console.log("[PASS] Repeated concurrent ticks create no duplicate trade");
  } finally {
    await Promise.all([first.worker.stop(), second.worker.stop()]);
  }
}

async function main(): Promise<void> {
  safety();

  console.log("Testing Limit Worker safety on isolated database");

  await testMarginIsolationAndCooldown();
  await testTwoWorkersSameOrder();

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
