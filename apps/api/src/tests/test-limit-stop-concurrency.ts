import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";
import { executePendingLimitOrder, executeTriggeredStop } from "../modules/orders/service.js";
import type { MarketPriceResponse } from "../modules/market/types.js";

const BASE = "http://localhost:4001/api/v1";
const CONTRACT_SIZE = 100;
type Side = "BUY" | "SELL";
type Mode = "limit-first" | "stop-first" | "race";
let passed = 0;

function safety(): void {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.TEST_DATABASE_URL || url !== process.env.TEST_DATABASE_URL ||
      new URL(url).pathname.replace(/^\//, "") !== "gold_trading_test" ||
      process.env.TEST_BASE_URL !== BASE || process.env.MARKET_DATA_PROVIDER !== "demo" ||
      process.env.STOP_WORKER_ENABLED !== "false" || process.env.LIMIT_WORKER_ENABLED !== "false") {
    throw new Error("STOP: isolated gold_trading_test, port 4001, demo provider and disabled workers required");
  }
}

async function api(path: string, method = "GET", token?: string, body?: object): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json: any = await response.json();
  assert.ok(response.ok && json.success === true,
    `${method} ${path}: HTTP ${response.status}: ${JSON.stringify(json)}`);
  return json.data;
}

function nearly(actual: number, expected: number, label: string): void {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 0.011,
    `${label}: expected ${expected.toFixed(2)}, got ${actual}`);
}

async function setup(side: Side) {
  const email = `limit-stop-${randomUUID()}@example.com`;
  const password = `Test@${randomUUID()}`;
  await api("/auth/register", "POST", undefined, { email, password, fullName: "Limit Stop Race" });
  const login = await api("/auth/login", "POST", undefined, { email, password });
  const token: string = login.accessToken;
  assert.ok(token);
  await api("/accounts/demo", "POST", token);
  const user = await db.orm.public.User.where({ email }).first();
  assert.ok(user, "API and test process must use the same test database");
  const account = await db.orm.public.DemoAccount.where({ userId: user.id }).first();
  assert.ok(account);
  const live = await getMarketPrice("XAUUSD");
  const bid = Number(live.bid), ask = Number(live.ask);
  assert.ok(Number.isFinite(bid) && Number.isFinite(ask) && bid > 100 && ask >= bid);
  const sl = side === "BUY" ? bid - 20 : ask + 20;
  const tp = side === "BUY" ? bid + 20 : ask - 20;
  const limitPrice = side === "BUY" ? ask - 10 : bid + 10;
  assert.ok(sl > 0 && tp > 0 && limitPrice > 0);
  const opened = await api("/orders", "POST", token, {
    symbol: "XAUUSD", side, orderType: "MARKET", quantity: "0.10",
    stopLoss: sl.toFixed(2), takeProfit: tp.toFixed(2),
  });
  assert.equal(opened.position.status, "OPEN");
  nearly(Number(opened.position.quantity), 0.10, "Initial position volume");
  // No stops on the pending limit: adding to an existing stopped position is permitted.
  const pending = await api("/orders", "POST", token, {
    symbol: "XAUUSD", side,
    orderType: side === "BUY" ? "BUY_LIMIT" : "SELL_LIMIT",
    quantity: "0.05", price: limitPrice.toFixed(2),
  });
  assert.equal(pending.order.status, "PENDING");
  return {
    userId: user.id, accountId: account.id, positionId: opened.position.id as string,
    orderId: pending.order.id as string, side, sl, entry: Number(opened.position.averageEntryPrice),
  };
}
type Scenario = Awaited<ReturnType<typeof setup>>;

function triggered(s: Scenario): MarketPriceResponse {
  // A single quote simultaneously triggers same-direction LIMIT and existing SL.
  const bid = s.side === "BUY" ? s.sl - 1 : s.sl + 0.8;
  const ask = bid + 0.2;
  return { symbol: "XAUUSD", bid: bid.toFixed(2), ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2), source: "limit-stop-race-test",
    timestamp: new Date().toISOString() };
}

async function snapshot(s: Scenario) {
  const [account, original, positions, orders, trades] = await Promise.all([
    db.orm.public.DemoAccount.where({ id: s.accountId }).first(),
    db.orm.public.Position.where({ id: s.positionId, accountId: s.accountId }).first(),
    db.orm.public.Position.where({ accountId: s.accountId }).all(),
    db.orm.public.Order.where({ accountId: s.accountId }).all(),
    db.orm.public.Trade.where({ accountId: s.accountId }).all(),
  ]);
  assert.ok(account); assert.ok(original);
  return { balance: Number(account.balance), equity: Number(account.equity), original, positions, orders, trades };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function verify(s: Scenario, before: Snapshot, after: Snapshot, limit: any, stop: any, q: MarketPriceResponse): string {
  assert.ok(limit, "Limit must fill");
  assert.ok(stop, "Stop must execute");
  assert.equal(limit.order.id, s.orderId, "Fill must update original pending order");
  assert.equal(limit.order.status, "FILLED");
  nearly(Number(limit.order.quantity), 0.05, "Limit volume");
  assert.equal(stop.order.status, "FILLED");
  assert.equal(stop.order.orderType, "MARKET");
  assert.equal(stop.order.side, s.side === "BUY" ? "SELL" : "BUY");
  assert.equal(after.orders.length, before.orders.length + 1, "Only closing order is newly created");
  assert.equal(after.trades.length, before.trades.length + 2, "Exactly one limit trade and one closing trade");
  assert.equal(after.orders.filter(o => o.id === s.orderId && o.status === "FILLED").length, 1);
  const opening = after.trades.filter(t => t.orderId === s.orderId);
  const closing = after.trades.filter(t => t.orderId === stop.order.id);
  assert.equal(opening.length, 1, "One opening trade per limit");
  assert.equal(closing.length, 1, "One closing trade per stop");
  nearly(Number(opening[0].quantity), 0.05, "Limit trade volume");
  assert.equal(opening[0].exitPrice, null);
  assert.equal(closing[0].positionId, s.positionId);
  const stopLots = Number(stop.order.quantity);
  assert.ok(Math.abs(stopLots - 0.10) < 0.00001 || Math.abs(stopLots - 0.15) < 0.00001);
  nearly(Number(closing[0].quantity), stopLots, "Stop trade volume");
  assert.equal(after.original.status, "CLOSED");
  nearly(Number(after.original.quantity), 0, "Original position closed");
  const exit = Number(stop.order.executedPrice);
  const expectedPnl = Number(((s.side === "BUY" ? exit - Number(closing[0].entryPrice) :
    Number(closing[0].entryPrice) - exit) * stopLots * CONTRACT_SIZE).toFixed(2));
  nearly(Number(stop.realizedPnl), expectedPnl, "Stop response realized P&L");
  nearly(Number(closing[0].realizedPnl), expectedPnl, "Stop trade realized P&L");
  nearly(after.balance, before.balance + expectedPnl, "Balance realizes stop P&L once");
  const open = after.positions.filter(p => p.status === "OPEN");
  const totalOpenLots = open.reduce((sum, p) => sum + Number(p.quantity), 0);
  nearly(stopLots + totalOpenLots, 0.15, "Volume conservation");
  const quoteBid = Number(q.bid), quoteAsk = Number(q.ask);
  const unrealized = open.reduce((sum, p) => sum +
    (p.side === "LONG" ? quoteBid - Number(p.averageEntryPrice) :
      Number(p.averageEntryPrice) - quoteAsk) * Number(p.quantity) * CONTRACT_SIZE, 0);
  nearly(after.equity, after.balance + unrealized, "Equity = balance + open P&L");
  if (Math.abs(stopLots - 0.15) < 0.00001) {
    assert.equal(open.length, 0, "Limit-first must close all lots");
    nearly(after.equity, after.balance, "Fully closed equity");
    return "limit-before-stop: merged 0.15 lots and closed";
  }
  assert.equal(open.length, 1, "Stop-first must leave one new position");
  assert.notEqual(open[0].id, s.positionId, "New position must have new ID");
  nearly(Number(open[0].quantity), 0.05, "New position lots");
  assert.equal(open[0].stopLoss, null, "New limit position has no inherited stop");
  assert.equal(open[0].takeProfit, null, "New limit position has no inherited TP");
  return "stop-before-limit: closed 0.10 and opened new 0.05";
}

async function scenario(side: Side, mode: Mode): Promise<void> {
  const s = await setup(side);
  const before = await snapshot(s);
  assert.equal(before.orders.length, 2);
  assert.equal(before.trades.length, 1);
  const q = triggered(s);
  const limit = () => executePendingLimitOrder(s.userId, s.orderId, q);
  const stop = () => executeTriggeredStop(s.userId, s.positionId, q);
  let l: any, a: any;
  if (mode === "limit-first") {
    l = await limit();
    a = await stop();
  } else if (mode === "stop-first") {
    a = await stop();
    l = await limit();
  } else {
    const [lr, ar] = await Promise.allSettled([limit(), stop()]);
    if (lr.status === "rejected") throw lr.reason;
    if (ar.status === "rejected") throw ar.reason;
    l = lr.value;
    a = ar.value;
  }
  const after = await snapshot(s);
  const outcome = verify(s, before, after, l, a, q);
  passed++;
  console.log(`[PASS] ${side} ${mode}: ${outcome}; accounting consistent`);
}

async function main(): Promise<void> {
  safety();
  const response = await fetch(`${BASE}/health`);
  assert.equal(response.status, 200, "Health endpoint must return HTTP 200");
  const health: any = await response.json();
  assert.equal(health.status, "ok");
  assert.equal(health.database, "connected");
  console.log("Testing Limit vs Stop on isolated gold_trading_test database");
  for (const side of ["BUY", "SELL"] as const) {
    for (const mode of ["limit-first", "stop-first", "race"] as const) {
      await scenario(side, mode);
    }
  }
  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch(error => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
