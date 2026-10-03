import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";
import { closePosition, executeTriggeredStop } from "../modules/orders/service.js";
import type { MarketPriceResponse } from "../modules/market/types.js";

const BASE = "http://localhost:4001/api/v1";
const CONTRACT_SIZE = 100;
let passed = 0;
type Side = "BUY" | "SELL";
type Kind = "SL" | "TP";
type Mode = "manual-first" | "auto-first" | "race";

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

async function setup(side: Side) {
  const email = `stop-partial-${randomUUID()}@example.com`;
  const password = `Test@${randomUUID()}`;
  await api("/auth/register", "POST", undefined, { email, password, fullName: "Stop Partial Race" });
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
  assert.ok(sl > 0 && tp > 0);
  const opened = await api("/orders", "POST", token, {
    symbol: "XAUUSD", side, orderType: "MARKET", quantity: "0.10",
    stopLoss: sl.toFixed(2), takeProfit: tp.toFixed(2),
  });
  assert.equal(opened.position.status, "OPEN");
  assert.equal(Number(opened.position.quantity), 0.10);
  return { userId: user.id, accountId: account.id, positionId: opened.position.id as string,
    side, sl, tp, entry: Number(opened.position.averageEntryPrice) };
}
type Scenario = Awaited<ReturnType<typeof setup>>;

function triggered(s: Scenario, kind: Kind): MarketPriceResponse {
  const price = kind === "SL" ? s.sl : s.tp;
  const bid = s.side === "BUY" ? price : price - 0.2;
  const ask = s.side === "BUY" ? price + 0.2 : price;
  return { symbol: "XAUUSD", bid: bid.toFixed(2), ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2), source: "stop-partial-race-test",
    timestamp: new Date().toISOString() };
}

async function snapshot(s: Scenario) {
  const [account, position, orders, trades] = await Promise.all([
    db.orm.public.DemoAccount.where({ id: s.accountId }).first(),
    db.orm.public.Position.where({ id: s.positionId, accountId: s.accountId }).first(),
    db.orm.public.Order.where({ accountId: s.accountId }).all(),
    db.orm.public.Trade.where({ accountId: s.accountId }).all(),
  ]);
  assert.ok(account); assert.ok(position);
  return { balance: Number(account.balance), equity: Number(account.equity), position, orders, trades };
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>;
function nearly(actual: number, expected: number, label: string): void {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 0.011,
    `${label}: expected ${expected.toFixed(2)}, got ${actual}`);
}

function verify(s: Scenario, before: Snapshot, after: Snapshot, manual: any, automatic: any): void {
  assert.ok(manual, "Manual partial close must succeed");
  assert.ok(automatic, "Triggered stop must close remaining position");
  assert.equal(manual.position.status, "OPEN");
  nearly(Number(manual.order.quantity), 0.03, "Manual close volume");
  nearly(Number(manual.position.quantity), 0.07, "Manual remaining volume");
  assert.equal(automatic.position.status, "CLOSED");
  nearly(Number(automatic.order.quantity), 0.07, "Automatic remaining close volume");
  assert.equal(after.position.status, "CLOSED");
  nearly(Number(after.position.quantity), 0, "Final remaining volume");
  assert.ok(after.position.closedAt);
  nearly(Number(after.position.unrealizedPnl), 0, "Final unrealized P&L");
  assert.equal(after.orders.length, before.orders.length + 2);
  assert.equal(after.trades.length, before.trades.length + 2);
  assert.notEqual(manual.order.id, automatic.order.id, "Closing orders must be distinct");
  let pnl = 0;
  for (const result of [manual, automatic]) {
    assert.equal(result.order.status, "FILLED");
    assert.equal(result.order.orderType, "MARKET");
    assert.equal(result.order.side, s.side === "BUY" ? "SELL" : "BUY");
    const matching = after.trades.filter(t => t.orderId === result.order.id);
    assert.equal(matching.length, 1, "One closing trade per closing order");
    const trade = matching[0];
    assert.equal(trade.positionId, s.positionId);
    const lots = Number(result.order.quantity);
    const exit = Number(result.order.executedPrice);
    const expected = Number(((s.side === "BUY" ? exit - s.entry : s.entry - exit) *
      lots * CONTRACT_SIZE).toFixed(2));
    nearly(Number(result.realizedPnl), expected, "Response realized P&L");
    nearly(Number(trade.realizedPnl), expected, "Trade realized P&L");
    nearly(Number(trade.quantity), lots, "Trade volume");
    nearly(Number(trade.exitPrice), exit, "Trade exit price");
    pnl += expected;
  }
  nearly(after.balance, before.balance + pnl, "Balance realizes P&L exactly once");
  nearly(after.equity, after.balance, "Closed account equity");
}

async function scenario(side: Side, kind: Kind, mode: Mode): Promise<void> {
  const s = await setup(side);
  const before = await snapshot(s);
  assert.equal(before.orders.length, 1);
  assert.equal(before.trades.length, 1);
  const q = triggered(s, kind);
  const manual = () => closePosition(s.userId, s.positionId, "0.03");
  const automatic = () => executeTriggeredStop(s.userId, s.positionId, q);
  let m: any;
  let a: any;
  if (mode === "manual-first") {
    m = await manual();
    a = await automatic();
  } else if (mode === "auto-first") {
    a = await automatic();
    assert.ok(a, "Stop should close full position first");
    nearly(Number(a.order.quantity), 0.10, "Stop-first volume");
    await assert.rejects(manual, (e: any) => e?.code === "POSITION_NOT_FOUND");
    const after = await snapshot(s);
    assert.equal(after.orders.length, before.orders.length + 1);
    assert.equal(after.trades.length, before.trades.length + 1);
    assert.equal(after.position.status, "CLOSED");
    nearly(Number(after.position.quantity), 0, "Stop-first final volume");
    const trade = after.trades.filter(t => t.orderId === a.order.id);
    assert.equal(trade.length, 1);
    const exit = Number(a.order.executedPrice);
    const expected = Number(((side === "BUY" ? exit - s.entry : s.entry - exit) * 0.10 * CONTRACT_SIZE).toFixed(2));
    nearly(Number(a.realizedPnl), expected, "Stop-first P&L");
    nearly(Number(trade[0].realizedPnl), expected, "Stop-first trade P&L");
    nearly(after.balance, before.balance + expected, "Stop-first balance");
    nearly(after.equity, after.balance, "Stop-first equity");
    passed++;
    console.log(`[PASS] ${side} ${kind} ${mode}: one full close, manual rejected, accounting consistent`);
    return;
  } else {
    const [mr, ar] = await Promise.allSettled([manual(), automatic()]);
    assert.equal(ar.status, "fulfilled", "Stop must complete without error");
    assert.equal(mr.status === "fulfilled" || mr.status === "rejected", true);
    if (ar.status !== "fulfilled") throw new Error("Automatic close did not fulfill");
    a = ar.value;
    assert.ok(a, "Triggered stop must execute");
    if (mr.status === "rejected") {
      assert.equal((mr.reason as any)?.code, "POSITION_NOT_FOUND");
      nearly(Number(a.order.quantity), 0.10, "Stop-wins volume");
      const after = await snapshot(s);
      assert.equal(after.position.status, "CLOSED");
      nearly(Number(after.position.quantity), 0, "Stop-wins final volume");
      assert.equal(after.orders.length, before.orders.length + 1);
      assert.equal(after.trades.length, before.trades.length + 1);
      const matching = after.trades.filter(t => t.orderId === a.order.id);
      assert.equal(matching.length, 1);
      const exit = Number(a.order.executedPrice);
      const expected = Number(((side === "BUY" ? exit - s.entry : s.entry - exit) * 0.10 * CONTRACT_SIZE).toFixed(2));
      nearly(Number(a.realizedPnl), expected, "Stop-wins P&L");
      nearly(Number(matching[0].realizedPnl), expected, "Stop-wins trade P&L");
      nearly(after.balance, before.balance + expected, "Stop-wins balance");
      nearly(after.equity, after.balance, "Stop-wins equity");
      passed++;
      console.log(`[PASS] ${side} ${kind} ${mode}: stop won, one full close, accounting consistent`);
      return;
    }
    m = mr.value;

  }
  const after = await snapshot(s);
  verify(s, before, after, m, a);
  passed++;
  console.log(`[PASS] ${side} ${kind} ${mode}: partial 0.03 + stop 0.07, accounting consistent`);
}

async function main(): Promise<void> {
  safety();
  const healthResponse = await fetch(`${BASE}/health`);
assert.equal(healthResponse.status, 200, "Health endpoint must return HTTP 200");
const health = await healthResponse.json();
assert.equal(health.status, "ok", "API health status must be ok");
assert.equal(health.database, "connected", "API database must be connected");
  console.log("Testing Stop vs Partial Close on isolated gold_trading_test database");
  for (const side of ["BUY", "SELL"] as const) {
    for (const kind of ["SL", "TP"] as const) {
      await scenario(side, kind, "manual-first");
      await scenario(side, kind, "auto-first");
      await scenario(side, kind, "race");
    }
  }
  console.log(`RESULT: passed=${passed} failed=0`);
}
main().catch(error => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
