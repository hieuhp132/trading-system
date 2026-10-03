/**
 * E2E Phase A: Pending Limit Order creation.
 *
 * Requirements:
 * - Dedicated test database.
 * - API and test process use the SAME database.
 * - MARKET_DATA_PROVIDER=demo.
 * - STOP_WORKER_ENABLED=false on both API and test process.
 *
 * Run:
 * pnpm exec tsx src/test-limit-order-e2e.ts
 */

import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";

const base = (
  process.env.TEST_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

let passed = 0;

function safety(): void {
  if (process.env.MARKET_DATA_PROVIDER !== "demo") {
    throw new Error("MARKET_DATA_PROVIDER must be demo");
  }

  if (process.env.STOP_WORKER_ENABLED !== "false") {
    throw new Error("STOP_WORKER_ENABLED must explicitly be false");
  }

  const actual = process.env.DATABASE_URL;
  const expected = process.env.TEST_DATABASE_URL;

  if (!actual || !expected || actual !== expected) {
    throw new Error("DATABASE_URL must equal TEST_DATABASE_URL");
  }

  const databaseName = new URL(actual).pathname.replace(/^\//, "");

  if (!/(test|testing|e2e)/i.test(databaseName)) {
    throw new Error("Database name must contain test/testing/e2e");
  }
}

async function request(
  path: string,
  method = "GET",
  token?: string,
  body?: object,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await response.json();

  return {
    status: response.status,
    json,
  };
}

async function setup() {
  const email = `limit-e2e-${randomUUID()}@example.com`;

  const password = "Test@123456";

  const registration = await request("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Limit Order E2E",
  });

  assert.ok(
    registration.status === 200 || registration.status === 201,
    "Registration failed",
  );

  const login = await request("/auth/login", "POST", undefined, {
    email,
    password,
  });

  assert.equal(login.status, 200);

  const token: string = login.json.data.accessToken;

  assert.ok(token);

  const created = await request("/accounts/demo", "POST", token);

  assert.ok(
    created.status === 200 || created.status === 201,
    "Demo account creation failed",
  );

  const user = await db.orm.public.User.where({
    email,
  }).first();

  assert.ok(user, "API and test must use the same database");

  const account = await db.orm.public.DemoAccount.where({
    userId: user.id,
  }).first();

  assert.ok(account);

  return {
    token,
    accountId: account.id,
  };
}

async function snapshot(accountId: string) {
  const account = await db.orm.public.DemoAccount.where({
    id: accountId,
  }).first();

  assert.ok(account);

  const [orders, positions, trades] = await Promise.all([
    db.orm.public.Order.where({
      accountId,
    }).all(),

    db.orm.public.Position.where({
      accountId,
    }).all(),

    db.orm.public.Trade.where({
      accountId,
    }).all(),
  ]);

  return {
    balance: String(account.balance),
    equity: String(account.equity),
    orders: orders.length,
    positions: positions.length,
    trades: trades.length,
  };
}

async function main(): Promise<void> {
  safety();

  console.log("Testing Pending Limit Orders on isolated database");

  const { token, accountId } = await setup();

  const initial = await snapshot(accountId);

  const quote = await getMarketPrice("XAUUSD");

  const bid = Number(quote.bid);
  const ask = Number(quote.ask);

  assert.ok(
    Number.isFinite(bid) && Number.isFinite(ask) && bid > 100 && ask >= bid,
    "Invalid demo quote",
  );

  const buyLimit = (bid - 100).toFixed(2);
  const sellLimit = (ask + 100).toFixed(2);

  // -------------------------------------------------
  // TEST 1: BUY LIMIT -> PENDING
  // -------------------------------------------------

  const buy = await request("/orders", "POST", token, {
    symbol: "XAUUSD",
    side: "BUY",
    orderType: "BUY_LIMIT",
    quantity: "0.01",
    price: buyLimit,
  });

  assert.equal(buy.status, 201, JSON.stringify(buy.json));

  assert.equal(buy.json.success, true);

  const buyResult = buy.json.data;

  assert.equal(buyResult.order.orderType, "BUY_LIMIT");

  assert.equal(buyResult.order.status, "PENDING");

  assert.equal(Number(buyResult.order.requestedPrice), Number(buyLimit));

  assert.equal(buyResult.order.executedPrice, null);

  assert.equal(buyResult.order.executedAt, null);

  assert.equal(buyResult.position, null);

  const storedBuy = await db.orm.public.Order.where({
    id: buyResult.order.id,
    accountId,
  }).first();

  assert.ok(storedBuy);
  assert.equal(storedBuy.status, "PENDING");
  assert.equal(storedBuy.executedPrice, null);
  assert.equal(storedBuy.executedAt, null);

  passed++;

  console.log("[PASS] BUY LIMIT creates PENDING order");

  // -------------------------------------------------
  // TEST 2: SELL LIMIT -> PENDING
  // -------------------------------------------------

  const sell = await request("/orders", "POST", token, {
    symbol: "XAUUSD",
    side: "SELL",
    orderType: "SELL_LIMIT",
    quantity: "0.01",
    price: sellLimit,
  });

  assert.equal(sell.status, 201, JSON.stringify(sell.json));

  assert.equal(sell.json.success, true);

  const sellResult = sell.json.data;

  assert.equal(sellResult.order.orderType, "SELL_LIMIT");

  assert.equal(sellResult.order.status, "PENDING");

  assert.equal(Number(sellResult.order.requestedPrice), Number(sellLimit));

  assert.equal(sellResult.order.executedPrice, null);

  assert.equal(sellResult.order.executedAt, null);

  assert.equal(sellResult.position, null);

  const storedSell = await db.orm.public.Order.where({
    id: sellResult.order.id,
    accountId,
  }).first();

  assert.ok(storedSell);
  assert.equal(storedSell.status, "PENDING");
  assert.equal(storedSell.executedPrice, null);
  assert.equal(storedSell.executedAt, null);

  passed++;

  console.log("[PASS] SELL LIMIT creates PENDING order");

  // -------------------------------------------------
  // TEST 3: Invalid BUY LIMIT
  // -------------------------------------------------

  const invalidBuy = await request("/orders", "POST", token, {
    symbol: "XAUUSD",
    side: "BUY",
    orderType: "BUY_LIMIT",
    quantity: "0.01",
    price: (ask + 100).toFixed(2),
  });

  assert.equal(invalidBuy.status, 400, JSON.stringify(invalidBuy.json));

  passed++;

  console.log("[PASS] Invalid BUY LIMIT rejected");

  // -------------------------------------------------
  // TEST 4: Invalid SELL LIMIT
  // -------------------------------------------------

  const invalidSell = await request("/orders", "POST", token, {
    symbol: "XAUUSD",
    side: "SELL",
    orderType: "SELL_LIMIT",
    quantity: "0.01",
    price: (bid - 100).toFixed(2),
  });

  assert.equal(invalidSell.status, 400, JSON.stringify(invalidSell.json));

  passed++;

  console.log("[PASS] Invalid SELL LIMIT rejected");

  // -------------------------------------------------
  // TEST 5: Database invariants
  // -------------------------------------------------

  const final = await snapshot(accountId);

  assert.equal(
    final.orders,
    initial.orders + 2,
    "Exactly two orders must be created",
  );

  assert.equal(
    final.positions,
    initial.positions,
    "Pending orders must not create positions",
  );

  assert.equal(
    final.trades,
    initial.trades,
    "Pending orders must not create trades",
  );

  assert.equal(
    final.balance,
    initial.balance,
    "Pending orders must not change balance",
  );

  assert.equal(
    final.equity,
    initial.equity,
    "Pending orders must not change equity",
  );

  passed++;

  console.log(
    "[PASS] Pending orders do not change account, positions or trades",
  );

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);

  console.error(`RESULT: passed=${passed} failed=1`);

  process.exitCode = 1;
});
