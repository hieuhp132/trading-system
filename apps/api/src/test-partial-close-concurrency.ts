import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "./database/prisma.js";

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
    throw new Error("STOP: demo provider and both workers disabled are required");
  }
}

type ApiResult = { status: number; json: any };

async function request(path: string, method = "GET", token?: string, body?: object): Promise<ApiResult> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json() };
}

async function success(path: string, method = "GET", token?: string, body?: object): Promise<any> {
  const result = await request(path, method, token, body);
  assert.ok(result.status >= 200 && result.status < 300 && result.json.success === true,
    `${method} ${path}: HTTP ${result.status} ${JSON.stringify(result.json)}`);
  return result.json.data;
}

async function setup(side: "BUY" | "SELL") {
  const email = `partial-race-${side.toLowerCase()}-${randomUUID()}@example.com`;
  const password = `Test@${randomUUID()}`;
  await success("/auth/register", "POST", undefined, { email, password, fullName: "Partial Close Race E2E" });
  const login = await success("/auth/login", "POST", undefined, { email, password });
  const token: string = login.accessToken;
  assert.ok(token);
  await success("/accounts/demo", "POST", token);
  const user = await db.orm.public.User.where({ email }).first();
  assert.ok(user, "API and test must use the same database");
  const account = await db.orm.public.DemoAccount.where({ userId: user.id }).first();
  assert.ok(account);
  const opened = await success("/orders", "POST", token, {
    symbol: "XAUUSD", side, orderType: "MARKET", quantity: "0.10",
  });
  assert.equal(opened.order.status, "FILLED");
  assert.ok(opened.position);
  assert.equal(Number(opened.position.quantity), 0.10);
  return {
    token,
    accountId: account.id,
    positionId: opened.position.id as string,
    entry: Number(opened.position.averageEntryPrice),
    side,
  };
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

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function nearly(actual: number, expected: number, message: string): void {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected) &&
    Math.abs(actual - expected) < 0.011,
    `${message}: expected ${expected.toFixed(2)}, got ${actual}`);
}

function verifyAccounting(s: Scenario, initial: Snapshot, final: Snapshot, closing: any[]): void {
  const closingIds = new Set(closing.map(result => result.order.id));
  assert.equal(closingIds.size, closing.length, "Closing orders must be unique");
  assert.equal(final.orders.length, initial.orders.length + closing.length);
  assert.equal(final.trades.length, initial.trades.length + closing.length);
  let pnl = 0;
  let volume = 0;
  for (const result of closing) {
    assert.equal(result.order.status, "FILLED");
    assert.equal(result.order.orderType, "MARKET");
    assert.equal(result.order.side, s.side === "BUY" ? "SELL" : "BUY");
    assert.equal(result.position.id, s.positionId);
    const trade = final.trades.filter(t => t.orderId === result.order.id);
    assert.equal(trade.length, 1, "Each closing order must have exactly one trade");
    assert.equal(trade[0].positionId, s.positionId);
    const lots = Number(result.order.quantity);
    const exit = Number(result.order.executedPrice);
    const expectedPnl = Number(((s.side === "BUY" ? exit - s.entry : s.entry - exit) *
      lots * CONTRACT_SIZE).toFixed(2));
    nearly(Number(result.realizedPnl), expectedPnl, "Response realized P&L");
    nearly(Number(trade[0].realizedPnl), expectedPnl, "Trade realized P&L");
    nearly(Number(trade[0].quantity), lots, "Trade volume");
    pnl += expectedPnl;
    volume += lots;
  }
  nearly(final.balance, initial.balance + pnl, "Final balance must realize P&L exactly once");
  nearly(volume + Number(final.position.quantity), 0.10, "Volume conservation");
  if (final.position.status === "CLOSED") {
    nearly(final.equity, final.balance, "Closed account equity");
    assert.ok(final.position.closedAt);
    nearly(Number(final.position.unrealizedPnl), 0, "Closed unrealized P&L");
  } else {
    assert.equal(final.position.status, "OPEN");
    assert.equal(final.position.closedAt, null);
    nearly(final.equity, final.balance + Number(final.position.unrealizedPnl), "Open account equity");
  }
}

async function runRace(side: "BUY" | "SELL", kind: "overlap" | "split" | "full") {
  const s = await setup(side);
  const initial = await snapshot(s);
  assert.equal(initial.orders.length, 1);
  assert.equal(initial.trades.length, 1);
  assert.equal(initial.position.status, "OPEN");
  const path = `/orders/positions/${encodeURIComponent(s.positionId)}/close`;
  const body = kind === "full" ? {} : { quantity: kind === "overlap" ? "0.07" : "0.05" };

  // Both requests start together. No assumption is made about which one wins.
  const results = await Promise.allSettled([
    request(path, "POST", s.token, body),
    request(path, "POST", s.token, body),
  ]);
  for (const result of results) {
    assert.equal(result.status, "fulfilled", "Both HTTP requests must return a response");
  }
  const responses = results.map(result => {
    if (result.status !== "fulfilled") throw result.reason;
    return result.value;
  });
  const accepted = responses.filter(r => r.status === 200 && r.json.success === true);
  const rejected = responses.filter(r => r.status !== 200);
  const expectedAccepted = kind === "split" ? 2 : 1;
  assert.equal(accepted.length, expectedAccepted, JSON.stringify(responses));
  assert.equal(rejected.length, 2 - expectedAccepted, JSON.stringify(responses));
  for (const result of rejected) {
    assert.ok([400, 404, 409].includes(result.status),
      `Unexpected rejection HTTP ${result.status}: ${JSON.stringify(result.json)}`);
    assert.equal(result.json.success, false);
  }
  const closing = accepted.map(r => r.json.data);
  const final = await snapshot(s);
  verifyAccounting(s, initial, final, closing);

  if (kind === "overlap") {
    assert.equal(final.position.status, "OPEN");
    nearly(Number(final.position.quantity), 0.03, "Overlap remaining volume");
    nearly(Number(closing[0].order.quantity), 0.07, "Overlap accepted volume");
  } else {
    assert.equal(final.position.status, "CLOSED");
    nearly(Number(final.position.quantity), 0, "Full remaining volume");
    for (const result of closing) {
      nearly(Number(result.order.quantity), kind === "split" ? 0.05 : 0.10,
        "Accepted close volume");
    }
  }
  passed++;
  console.log(`[PASS] ${side}: ${kind} concurrent closes -> ${accepted.length} accepted, ${rejected.length} rejected; volume and accounting consistent`);
}

async function main(): Promise<void> {
  safety();
  const health = await request("/health");
  assert.equal(health.status, 200, "Test API must be reachable");
  console.log("Testing concurrent Partial Close on isolated gold_trading_test database");
  for (const side of ["BUY", "SELL"] as const) {
    await runRace(side, "overlap");
    await runRace(side, "split");
    await runRace(side, "full");
  }
  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch(error => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
