import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";

const BASE = "http://localhost:4001/api/v1";
const CONTRACT_SIZE = 100;
let passed = 0;

function safety(): void {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.TEST_DATABASE_URL || url !== process.env.TEST_DATABASE_URL) {
    throw new Error("STOP: DATABASE_URL must equal TEST_DATABASE_URL");
  }
  if (new URL(url).pathname.replace(/^\//, "") !== "gold_trading_test") {
    throw new Error("STOP: Only gold_trading_test is allowed");
  }
  if (process.env.TEST_BASE_URL !== BASE) {
    throw new Error(`STOP: TEST_BASE_URL must be ${BASE}`);
  }
  if (process.env.MARKET_DATA_PROVIDER !== "demo" ||
      process.env.STOP_WORKER_ENABLED !== "false" ||
      process.env.LIMIT_WORKER_ENABLED !== "false") {
    throw new Error("STOP: demo provider and both workers explicitly disabled are required");
  }
}

async function request(path: string, method = "GET", token?: string, body?: object) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json: any = await response.json();
  return { status: response.status, json };
}

async function success(path: string, method = "GET", token?: string, body?: object): Promise<any> {
  const result = await request(path, method, token, body);
  assert.ok(result.status >= 200 && result.status < 300 && result.json.success === true,
    `${method} ${path}: HTTP ${result.status} ${JSON.stringify(result.json)}`);
  return result.json.data;
}

async function setup(side: "BUY" | "SELL") {
  const email = `partial-close-${side.toLowerCase()}-${randomUUID()}@example.com`;
  const password = `Test@${randomUUID()}`;
  await success("/auth/register", "POST", undefined, { email, password, fullName: "Partial Close E2E" });
  const login = await success("/auth/login", "POST", undefined, { email, password });
  const token: string = login.accessToken;
  assert.ok(token);
  await success("/accounts/demo", "POST", token);

  const user = await db.orm.public.User.where({ email }).first();
  assert.ok(user, "API and test process must use the same database");
  const account = await db.orm.public.DemoAccount.where({ userId: user.id }).first();
  assert.ok(account);

  const opened = await success("/orders", "POST", token, {
    symbol: "XAUUSD", side, orderType: "MARKET", quantity: "0.10",
  });
  assert.equal(opened.order.status, "FILLED");
  assert.ok(opened.position);
  assert.equal(opened.position.side, side === "BUY" ? "LONG" : "SHORT");
  assert.equal(Number(opened.position.quantity), 0.10);
  return { token, accountId: account.id, positionId: opened.position.id as string,
    entry: Number(opened.position.averageEntryPrice), side };
}

type Scenario = Awaited<ReturnType<typeof setup>>;

async function snapshot(s: Scenario) {
  const [account, position, orders, trades] = await Promise.all([
    db.orm.public.DemoAccount.where({ id: s.accountId }).first(),
    db.orm.public.Position.where({ id: s.positionId, accountId: s.accountId }).first(),
    db.orm.public.Order.where({ accountId: s.accountId }).all(),
    db.orm.public.Trade.where({ accountId: s.accountId }).all(),
  ]);
  assert.ok(account);
  assert.ok(position);
  return {
    balance: Number(account.balance), equity: Number(account.equity),
    position, orders, trades,
  };
}

function nearly(actual: number, expected: number, message: string): void {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) < 0.011,
    `${message}: expected ${expected.toFixed(2)}, got ${actual}`);
}

function expectedPnl(s: Scenario, closePrice: number, lots: number): number {
  const diff = s.side === "BUY" ? closePrice - s.entry : s.entry - closePrice;
  return Number((diff * lots * CONTRACT_SIZE).toFixed(2));
}

function assertNoWrites(before: Awaited<ReturnType<typeof snapshot>>,
                        after: Awaited<ReturnType<typeof snapshot>>): void {
  assert.equal(after.orders.length, before.orders.length);
  assert.equal(after.trades.length, before.trades.length);
  assert.equal(after.position.status, before.position.status);
  assert.equal(String(after.position.quantity), String(before.position.quantity));
  assert.equal(after.balance, before.balance);
  assert.equal(after.equity, before.equity);
}

async function scenario(side: "BUY" | "SELL"): Promise<void> {
  const s = await setup(side);
  const path = `/orders/positions/${encodeURIComponent(s.positionId)}/close`;
  const initial = await snapshot(s);
  assert.equal(initial.orders.length, 1);
  assert.equal(initial.trades.length, 1);
  assert.equal(initial.position.status, "OPEN");

  // Invalid close must not create an order, trade or change the account.
  const over = await request(path, "POST", s.token, { quantity: "0.11" });
  assert.equal(over.status, 400, JSON.stringify(over.json));
  assertNoWrites(initial, await snapshot(s));
  passed++;
  console.log(`[PASS] ${side}: excess quantity rejected without writes`);

  const invalid = await request(path, "POST", s.token, { quantity: "0.001" });
  assert.equal(invalid.status, 400, JSON.stringify(invalid.json));
  assertNoWrites(initial, await snapshot(s));
  passed++;
  console.log(`[PASS] ${side}: invalid volume step rejected without writes`);

  // First close: 0.03 of 0.10 lots, leaving 0.07 OPEN.
  const partial = await success(path, "POST", s.token, { quantity: "0.03" });
  assert.equal(partial.order.status, "FILLED");
  assert.equal(partial.order.side, side === "BUY" ? "SELL" : "BUY");
  assert.equal(Number(partial.order.quantity), 0.03);
  assert.equal(partial.position.id, s.positionId);
  assert.equal(partial.position.status, "OPEN");
  nearly(Number(partial.position.quantity), 0.07, "Remaining volume");
  const partialPrice = Number(partial.order.executedPrice);
  const partialPnl = expectedPnl(s, partialPrice, 0.03);
  nearly(Number(partial.realizedPnl), partialPnl, "Partial realized P&L");
  nearly(Number(partial.account.balance), initial.balance + partialPnl, "Partial response balance");
  const afterPartial = await snapshot(s);
  assert.equal(afterPartial.position.status, "OPEN");
  assert.equal(afterPartial.position.closedAt, null);
  nearly(Number(afterPartial.position.quantity), 0.07, "Stored remaining volume");
  assert.equal(afterPartial.orders.length, 2);
  assert.equal(afterPartial.trades.length, 2);
  const partialTrade = afterPartial.trades.find(t => t.orderId === partial.order.id);
  assert.ok(partialTrade);
  assert.equal(partialTrade.positionId, s.positionId);
  nearly(Number(partialTrade.quantity), 0.03, "Partial trade volume");
  nearly(Number(partialTrade.realizedPnl), partialPnl, "Partial trade P&L");
  nearly(afterPartial.balance, initial.balance + partialPnl, "Stored partial balance");
  const remainingPnl = expectedPnl(s, partialPrice, 0.07);
  nearly(Number(afterPartial.position.unrealizedPnl), remainingPnl, "Remaining unrealized P&L");
  nearly(afterPartial.equity, afterPartial.balance + remainingPnl, "Partial equity");
  passed++;
  console.log(`[PASS] ${side}: partial close 0.03 -> 0.07 OPEN, trade and accounting`);

  // Closing too much after partial close must leave the database untouched.
  const excessRemaining = await request(path, "POST", s.token, { quantity: "0.08" });
  assert.equal(excessRemaining.status, 400, JSON.stringify(excessRemaining.json));
  assertNoWrites(afterPartial, await snapshot(s));
  passed++;
  console.log(`[PASS] ${side}: excess remaining volume rejected without writes`);

  // Omitting quantity must close the entire remainder.
  const full = await success(path, "POST", s.token, {});
  assert.equal(full.position.status, "CLOSED");
  assert.equal(Number(full.position.quantity), 0);
  assert.equal(Number(full.order.quantity), 0.07);
  const fullPrice = Number(full.order.executedPrice);
  const fullPnl = expectedPnl(s, fullPrice, 0.07);
  nearly(Number(full.realizedPnl), fullPnl, "Final realized P&L");
  const afterFull = await snapshot(s);
  assert.equal(afterFull.position.status, "CLOSED");
  assert.ok(afterFull.position.closedAt);
  assert.equal(Number(afterFull.position.quantity), 0);
  assert.equal(Number(afterFull.position.unrealizedPnl), 0);
  assert.equal(afterFull.orders.length, 3);
  assert.equal(afterFull.trades.length, 3);
  const fullTrade = afterFull.trades.find(t => t.orderId === full.order.id);
  assert.ok(fullTrade);
  nearly(Number(fullTrade.quantity), 0.07, "Final trade volume");
  nearly(Number(fullTrade.realizedPnl), fullPnl, "Final trade P&L");
  nearly(afterFull.balance, initial.balance + partialPnl + fullPnl, "Final balance");
  nearly(afterFull.equity, afterFull.balance, "Final equity");
  passed++;
  console.log(`[PASS] ${side}: full close remainder -> CLOSED, two closing trades, final accounting`);

  const duplicate = await request(path, "POST", s.token, {});
  assert.equal(duplicate.status, 404, JSON.stringify(duplicate.json));
  assertNoWrites(afterFull, await snapshot(s));
  passed++;
  console.log(`[PASS] ${side}: repeated close rejected without duplicate trade`);
}

async function main(): Promise<void> {
  safety();
  const health = await request("/health");
  assert.equal(health.status, 200, "Test API must be reachable");
  const quote = await getMarketPrice("XAUUSD");
  assert.ok(Number(quote.bid) > 0 && Number(quote.ask) >= Number(quote.bid));
  console.log("Testing Partial Close on isolated gold_trading_test database");
  await scenario("BUY");
  await scenario("SELL");
  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch(error => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
