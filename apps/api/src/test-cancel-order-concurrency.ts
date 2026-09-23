import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "./database/prisma.js";
import { getMarketPrice } from "./modules/market/service.js";
import {
  cancelPendingLimitOrder,
  executePendingLimitOrder,
} from "./modules/orders/service.js";

import type { MarketPriceResponse } from "./modules/market/types.js";

const base = (
  process.env.TEST_BASE_URL ?? "http://localhost:4001/api/v1"
).replace(/\/$/, "");

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

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing");
  }

  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");

  if (databaseName !== "gold_trading_test") {
    throw new Error(
      `STOP: Expected gold_trading_test, received ${databaseName}`,
    );
  }

  if (
    process.env.TEST_DATABASE_URL &&
    process.env.TEST_DATABASE_URL !== databaseUrl
  ) {
    throw new Error("DATABASE_URL differs from TEST_DATABASE_URL");
  }

  if (base !== "http://localhost:4001/api/v1") {
    throw new Error(`Unexpected TEST_BASE_URL: ${base}`);
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
  const email = `cancel-race-${randomUUID()}@example.com`;
  const password = "Test@123456";

  await api("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Cancel Concurrency Test",
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
    Number.isFinite(bid) &&
      Number.isFinite(ask) &&
      bid > 100 &&
      ask >= bid,
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
    source: "cancel-concurrency-test",
    timestamp: new Date().toISOString(),
  };
}

async function snapshot(s: Scenario) {
  const [order, positions, trades] = await Promise.all([
    db.orm.public.Order.where({
      id: s.orderId,
      accountId: s.accountId,
    }).first(),

    db.orm.public.Position.where({
      accountId: s.accountId,
    }).all(),

    db.orm.public.Trade.where({
      accountId: s.accountId,
    }).all(),
  ]);

  assert.ok(order);

  return {
    order,
    positions,
    trades,
  };
}

function isOrderNotPending(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ORDER_NOT_PENDING"
  );
}

async function testCancelFirst(): Promise<void> {
  const s = await setup();

  const cancelled = await cancelPendingLimitOrder(s.userId, s.orderId);

  assert.equal(cancelled.status, "CANCELLED");

  const execution = await executePendingLimitOrder(
    s.userId,
    s.orderId,
    makeQuote(s.limitPrice),
  );

  assert.equal(execution, null);

  const after = await snapshot(s);

  assert.equal(after.order.status, "CANCELLED");
  assert.equal(after.positions.length, 0);
  assert.equal(after.trades.length, 0);

  console.log("[PASS] Cancel first: no execution or trade");
}

async function testWorkerFirst(): Promise<void> {
  const s = await setup();

  const execution = await executePendingLimitOrder(
    s.userId,
    s.orderId,
    makeQuote(s.limitPrice),
  );

  assert.ok(execution);
  assert.equal(execution.order.status, "FILLED");

  await assert.rejects(
    () => cancelPendingLimitOrder(s.userId, s.orderId),
    isOrderNotPending,
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "FILLED");
  assert.equal(after.positions.length, 1);
  assert.equal(after.trades.length, 1);
  assert.equal(after.trades[0].orderId, s.orderId);

  console.log("[PASS] Worker first: Cancel rejected, one trade");
}

async function testConcurrent(): Promise<void> {
  const s = await setup();

  const [cancel, execution] = await Promise.allSettled([
    cancelPendingLimitOrder(s.userId, s.orderId),
    executePendingLimitOrder(
      s.userId,
      s.orderId,
      makeQuote(s.limitPrice),
    ),
  ]);

  const after = await snapshot(s);

  if (after.order.status === "CANCELLED") {
    assert.equal(cancel.status, "fulfilled");

    if (cancel.status === "fulfilled") {
      assert.equal(cancel.value.status, "CANCELLED");
    }

    assert.equal(execution.status, "fulfilled");

    if (execution.status === "fulfilled") {
      assert.equal(execution.value, null);
    }

    assert.equal(after.positions.length, 0);
    assert.equal(after.trades.length, 0);

    console.log("[PASS] Concurrent: Cancel wins safely");
    return;
  }

  assert.equal(after.order.status, "FILLED");

  assert.equal(execution.status, "fulfilled");

  if (execution.status === "fulfilled") {
    assert.ok(execution.value);
    assert.equal(execution.value?.order.status, "FILLED");
  }

  assert.equal(cancel.status, "rejected");

  if (cancel.status === "rejected") {
    assert.ok(isOrderNotPending(cancel.reason));
  }

  assert.equal(after.positions.length, 1);
  assert.equal(after.trades.length, 1);
  assert.equal(after.trades[0].orderId, s.orderId);

  console.log("[PASS] Concurrent: Worker wins safely");
}

async function main(): Promise<void> {
  safety();

  console.log("Testing Cancel vs Limit execution on gold_trading_test");

  await testCancelFirst();
  await testWorkerFirst();
  await testConcurrent();

  console.log("RESULT: passed=3 failed=0");
}

main().catch((error) => {
  console.error("[FAIL]", error);
  process.exitCode = 1;
});
