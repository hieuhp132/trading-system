/**
 * Run from apps/api: pnpm exec tsx src/test-automatic-stops.ts
 * ONLY against isolated test DB, MARKET_DATA_PROVIDER=demo.
 * Creates test users and positions; no existing records are deleted.
 * Importing service directly means API server and this process MUST point to SAME DB.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { executeTriggeredStop, closePosition, getMyOrders, getMyTrades, getMyPosition } from './modules/orders/service.js';
import { getMarketPrice } from './modules/market/service.js';
import { db } from './database/prisma.js';
import type { MarketPriceResponse } from './modules/market/types.js';

const base = (process.env.TEST_BASE_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`[PASS] ${name}`);
}
async function api(path: string, method = 'GET', token?: string, body?: object): Promise<any> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json: any = await response.json();
  if (!response.ok || !json.success) throw new Error(`${method} ${path}: HTTP ${response.status}: ${JSON.stringify(json)}`);
  return json.data;
}
async function user() {
  const email = `auto-stop-${randomUUID()}@example.com`;
  const password = 'Test@123456';
  await api('/auth/register', 'POST', undefined, { email, password, fullName: 'Automatic Stops Test' });
  const login = await api('/auth/login', 'POST', undefined, { email, password });
  const token: string = login.accessToken;
  const account = await api('/accounts/demo', 'POST', token);
  const dbUser = await db.orm.public.User.where({ email }).first();
  assert.ok(dbUser, 'Test user missing in DB: API and test process must use the same isolated database');
  const userId = dbUser.id;
  assert.ok(account.id);
  return { userId, token, accountId: account.id as string };
}
function quote(bid: number, ask: number): MarketPriceResponse {
  assert.ok(bid > 0 && ask >= bid);
  return { symbol: 'XAUUSD', bid: bid.toFixed(2), ask: ask.toFixed(2), last: ((bid + ask) / 2).toFixed(2), source: 'test', timestamp: new Date().toISOString() };
}
async function setup(side: 'BUY' | 'SELL') {
  const u = await user();
  const live = await getMarketPrice('XAUUSD');
  const bid = Number(live.bid), ask = Number(live.ask);
  assert.ok(Number.isFinite(bid) && Number.isFinite(ask) && bid > 100 && ask >= bid);
  const sl = side === 'BUY' ? bid - 20 : ask + 20;
  const tp = side === 'BUY' ? bid + 20 : ask - 20;
  assert.ok(sl > 0 && tp > 0);
  const opened = await api('/orders', 'POST', u.token, {
    symbol: 'XAUUSD', side, orderType: 'MARKET', quantity: '0.01', stopLoss: sl.toFixed(2), takeProfit: tp.toFixed(2),
  });
  assert.equal(opened.position.status, 'OPEN');
  return { ...u, id: opened.position.id as string, sl, tp, bid, ask, side };
}
async function snapshot(u: Awaited<ReturnType<typeof setup>>) {
  const [orders, trades, position, account] = await Promise.all([
    getMyOrders(u.userId), getMyTrades(u.userId), getMyPosition(u.userId, u.id), db.orm.public.DemoAccount.where({ id: u.accountId }).first(),
  ]);
  assert.ok(account);
  return { orders: orders.items.length, trades: trades.items.length, position, balance: Number(account.balance), equity: Number(account.equity) };
}
function triggered(u: Awaited<ReturnType<typeof setup>>, kind: 'SL' | 'TP') {
  const price = kind === 'SL' ? u.sl : u.tp;
  return u.side === 'BUY' ? quote(price, price + 0.2) : quote(price - 0.2, price);
}
async function assertClose(u: Awaited<ReturnType<typeof setup>>, kind: 'SL' | 'TP') {
  const before = await snapshot(u);
  const q = triggered(u, kind);
  const result = await executeTriggeredStop(u.userId, u.id, q);
  assert.ok(result, 'Expected automatic close');
  const after = await snapshot(u);
  const executionPrice = u.side === 'BUY' ? q.bid : q.ask;
  assert.equal(result.position.status, 'CLOSED');
  assert.equal(after.position.status, 'CLOSED');
  assert.equal(Number(after.position.quantity), 0);
  assert.equal(Number(result.order.executedPrice), Number(executionPrice));
  assert.equal(after.orders, before.orders + 1);
  assert.equal(after.trades, before.trades + 1);
  assert.ok(Math.abs(after.balance - (before.balance + Number(result.realizedPnl))) < 0.011);
  assert.ok(Math.abs(after.equity - after.balance) < 0.011);
  const trades = (await getMyTrades(u.userId)).items.filter(t => t.positionId === u.id && t.realizedPnl !== null);
  assert.equal(trades.length, 1);
  assert.equal(Number(trades[0].exitPrice), Number(executionPrice));
  assert.equal(Number(trades[0].realizedPnl), Number(result.realizedPnl));
  return { q, after };
}
async function main() {
  if (process.env.MARKET_DATA_PROVIDER !== 'demo') throw new Error('Set MARKET_DATA_PROVIDER=demo. Run ONLY against isolated test DB.');
  await check('AUTO-01: no trigger does not write', async () => {
    const u = await setup('BUY');
    const before = await snapshot(u);
    const result = await executeTriggeredStop(u.userId, u.id, quote((u.sl + u.tp) / 2, (u.sl + u.tp) / 2 + 0.2));
    const after = await snapshot(u);
    assert.equal(result, null);
    assert.equal(after.position.status, 'OPEN');
    assert.equal(after.orders, before.orders);
    assert.equal(after.trades, before.trades);
    assert.equal(after.balance, before.balance);
    await closePosition(u.userId, u.id);
  });
  for (const side of ['BUY', 'SELL'] as const) for (const kind of ['SL', 'TP'] as const) {
    await check(`AUTO: ${side} ${kind} full close / accounting`, async () => { await assertClose(await setup(side), kind); });
  }
  await check('AUTO-05: sequential duplicate is no-op', async () => {
    const u = await setup('BUY');
    const { q, after: before } = await assertClose(u, 'SL');
    assert.equal(await executeTriggeredStop(u.userId, u.id, q), null);
    const after = await snapshot(u);
    assert.equal(after.orders, before.orders);
    assert.equal(after.trades, before.trades);
    assert.equal(after.balance, before.balance);
  });
  await check('AUTO-06: concurrent auto calls close once', async () => {
    const u = await setup('SELL');
    const before = await snapshot(u);
    const q = triggered(u, 'TP');
    const results = await Promise.allSettled([
      executeTriggeredStop(u.userId, u.id, q), executeTriggeredStop(u.userId, u.id, q),
    ]);
    const after = await snapshot(u);
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value !== null).length, 1);
    assert.equal(after.position.status, 'CLOSED');
    assert.equal(after.orders, before.orders + 1);
    assert.equal(after.trades, before.trades + 1);
  });
  await check('AUTO-07: manual/auto race closes once', async () => {
    const u = await setup('BUY');
    const before = await snapshot(u);
    const results = await Promise.allSettled([
      executeTriggeredStop(u.userId, u.id, triggered(u, 'TP')),
      closePosition(u.userId, u.id),
    ]);
    const after = await snapshot(u);
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value !== null).length, 1);
    assert.equal(after.position.status, 'CLOSED');
    assert.equal(after.orders, before.orders + 1);
    assert.equal(after.trades, before.trades + 1);
  });
  console.log(`RESULT: passed=${passed} failed=0`);
}
main().catch(err => { console.error('[FAIL]', err); console.error(`RESULT: passed=${passed} failed=1`); process.exitCode = 1; });
