import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";
import { executePendingLimitOrder } from "../modules/orders/service.js";

import type { MarketPriceResponse } from "../modules/market/types.js";

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

  if (
    !process.env.DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL
  ) {
    throw new Error("DATABASE_URL must equal TEST_DATABASE_URL");
  }

  const name = new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "");

  if (!/(test|testing|e2e)/i.test(name)) {
    throw new Error("Use a dedicated test database");
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

function makeQuote(
  bid: number,
  ask: number,
  timestamp = new Date().toISOString(),
): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "e2e-controlled-quote",
    timestamp,
  };
}

async function setup(side: "BUY" | "SELL") {
  const email = `limit-fill-${randomUUID()}@example.com`;
  const password = "Test@123456";

  await api("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Limit Execution E2E",
  });

  const login = await api("/auth/login", "POST", undefined, {
    email,
    password,
  });

  const token: string = login.accessToken;

  const account = await api("/accounts/demo", "POST", token);

  const user = await db.orm.public.User.where({ email }).first();

  assert.ok(user, "API and test must use the same database");

  const market = await getMarketPrice("XAUUSD");

  const bid = Number(market.bid);
  const ask = Number(market.ask);

  assert.ok(Number.isFinite(bid) && Number.isFinite(ask));
  assert.ok(bid > 100 && ask >= bid);

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

async function scenario(side: "BUY" | "SELL") {
  const s = await setup(side);
  const before = await snapshot(s);

  // 1. Price has not reached the limit.
  const notTriggered = await executePendingLimitOrder(
    s.userId,
    s.orderId,
    quoteFor(s, false),
  );

  assert.equal(notTriggered, null);

  const unchanged = await snapshot(s);

  assert.equal(unchanged.order.status, "PENDING");
  assert.equal(unchanged.positions.length, before.positions.length);
  assert.equal(unchanged.trades.length, before.trades.length);
  assert.equal(unchanged.balance, before.balance);

  passed++;
  console.log(`[PASS] ${side}: no trigger -> unchanged`);

  // 2. Price reaches the limit.
  const quote = quoteFor(s, true);

  const filled = await executePendingLimitOrder(s.userId, s.orderId, quote);

  assert.ok(filled);
  assert.equal(filled.order.id, s.orderId);
  assert.equal(filled.order.status, "FILLED");
  assert.ok(filled.position);

  const expectedPrice = side === "BUY" ? Number(quote.ask) : Number(quote.bid);

  assert.equal(Number(filled.order.executedPrice), expectedPrice);

  const after = await snapshot(s);

  assert.equal(after.order.status, "FILLED");
  assert.equal(after.positions.length, before.positions.length + 1);
  assert.equal(after.trades.length, before.trades.length + 1);
  assert.equal(after.trades[0].orderId, s.orderId);
  assert.equal(after.balance, before.balance);

  passed++;
  console.log(`[PASS] ${side}: trigger -> FILLED + position + trade`);

  // 3. Repeated execution must not create another trade.
  const repeated = await executePendingLimitOrder(
    s.userId,
    s.orderId,
    makeQuote(expectedPrice - 0.2, expectedPrice),
  );

  assert.equal(repeated, null);

  const final = await snapshot(s);

  assert.equal(final.trades.length, after.trades.length);
  assert.equal(final.positions.length, after.positions.length);
  assert.equal(final.balance, after.balance);

  passed++;
  console.log(`[PASS] ${side}: repeated execution -> no duplicate`);
}

async function concurrentScenario() {
  const s = await setup("BUY");
  const quote = quoteFor(s, true);

  const results = await Promise.all([
    executePendingLimitOrder(s.userId, s.orderId, quote),
    executePendingLimitOrder(s.userId, s.orderId, quote),
  ]);

  assert.equal(
    results.filter((result) => result !== null).length,
    1,
    "Exactly one execution must succeed",
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "FILLED");
  assert.equal(after.positions.length, 1);
  assert.equal(after.trades.length, 1);

  passed++;
  console.log("[PASS] Concurrent execution -> exactly one trade");
}

async function staleQuoteScenario() {
  const s = await setup("BUY");
  const before = await snapshot(s);

  const fresh = quoteFor(s, true);

  const stale = {
    ...fresh,
    timestamp: new Date(Date.now() - 60_000).toISOString(),
  };

  await assert.rejects(
    executePendingLimitOrder(s.userId, s.orderId, stale),
    (error: unknown) =>
      (error as { code?: string }).code === "STALE_MARKET_QUOTE",
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "PENDING");
  assert.equal(after.positions.length, before.positions.length);
  assert.equal(after.trades.length, before.trades.length);
  assert.equal(after.balance, before.balance);

  passed++;
  console.log("[PASS] Stale quote -> rejected without writes");
}

async function insufficientMarginScenario() {
  const s = await setup("BUY");

  // This test user has no open positions.
  // Reduce available funds to zero in the isolated test DB.
  const updatedAccount = await db.orm.public.DemoAccount.where({
    id: s.accountId,
  }).update({
    balance: "0.00",
    equity: "0.00",
  });

  assert.ok(updatedAccount);

  const before = await snapshot(s);

  assert.equal(before.positions.length, 0);
  assert.equal(before.trades.length, 0);
  assert.equal(before.balance, 0);

  await assert.rejects(
    executePendingLimitOrder(s.userId, s.orderId, quoteFor(s, true)),
    (error: unknown) =>
      (error as { code?: string }).code === "INSUFFICIENT_MARGIN",
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "PENDING");
  assert.equal(after.order.executedPrice, null);
  assert.equal(after.order.executedAt, null);

  assert.equal(after.positions.length, 0);
  assert.equal(after.trades.length, 0);

  assert.equal(after.balance, before.balance);
  assert.equal(after.equity, before.equity);

  passed++;
  console.log("[PASS] Insufficient margin -> transaction unchanged");
}

async function invalidStopsScenario() {
  const s = await setup("BUY");

  const executionQuote = quoteFor(s, true);

  // For a LONG position, Stop Loss must be below
  // the relevant current market level.
  // This value is deliberately invalid at execution.
  const invalidStopLoss = (Number(executionQuote.ask) + 100).toFixed(2);

  const updatedOrder = await db.orm.public.Order.where({
    id: s.orderId,
    accountId: s.accountId,
    status: "PENDING",
  }).update({
    stopLoss: invalidStopLoss,
  });

  assert.ok(updatedOrder);

  const before = await snapshot(s);

  assert.equal(before.order.status, "PENDING");
  assert.equal(before.positions.length, 0);
  assert.equal(before.trades.length, 0);

  await assert.rejects(
    executePendingLimitOrder(s.userId, s.orderId, executionQuote),
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "PENDING");
  assert.equal(after.order.executedPrice, null);
  assert.equal(after.order.executedAt, null);

  assert.equal(after.positions.length, 0);
  assert.equal(after.trades.length, 0);

  assert.equal(after.balance, before.balance);
  assert.equal(after.equity, before.equity);

  passed++;
  console.log("[PASS] Invalid SL -> transaction unchanged");
}

async function quoteExpiresWhileWaitingForLockScenario() {
  const s = await setup("BUY");
  const before = await snapshot(s);

  const quote = quoteFor(s, true);

  const maxAgeMs = Number(process.env.LIMIT_WORKER_MAX_QUOTE_AGE_MS ?? 5000);

  assert.ok(
    Number.isInteger(maxAgeMs) && maxAgeMs >= 100,
    "Invalid quote max age",
  );

  let signalAcquired!: () => void;
  let signalFailure!: (error: unknown) => void;
  let releaseLock!: () => void;

  const acquired = new Promise<void>((resolve, reject) => {
    signalAcquired = resolve;
    signalFailure = reject;
  });

  const release = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  let holder: Promise<unknown> | undefined;
  let execution:
    | Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>
    | undefined;

  try {
    holder = db.transaction(async (tx) => {
      try {
        const plan = db.raw.sql`
          SELECT "id"
          FROM "public"."demoAccount"
          WHERE "id" = ${s.accountId}
          FOR UPDATE
        `
          .returnsRow({
            id: { codecId: "pg/text@1" },
          })
          .build();

        const rows = await tx.query(plan);

        assert.equal(rows.length, 1);

        signalAcquired();

        // The lock is held until the test releases it.
        await release;
      } catch (error) {
        signalFailure(error);
        throw error;
      }
    });

    // Attach a rejection handler immediately.
    holder.catch(() => undefined);

    await Promise.race([
      acquired,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Timed out acquiring account lock")),
          5000,
        );
      }),
    ]);

    // Start execution only after the account lock is held.
    execution = executePendingLimitOrder(s.userId, s.orderId, quote).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    );

    // Let the quote expire while transaction A holds the lock.
    const expiry = Date.parse(quote.timestamp) + maxAgeMs;
    const waitMs = Math.max(0, expiry + 250 - Date.now());

    await new Promise<void>((resolve) => {
      setTimeout(resolve, waitMs);
    });
  } finally {
    // Always release the lock, including assertion failures.
    releaseLock();

    if (holder) {
      await holder;
    }
  }

  assert.ok(execution);

  const result = await execution;

  assert.equal(result.ok, false, "Expired quote must not execute");

  if (result.ok) {
    throw new Error("Limit Order unexpectedly executed with stale quote");
  }

  // Check the actual error instead of relying on its message.
  const error = result.error as {
    code?: string;
    message?: string;
  };

  assert.equal(
    error.code,
    "STALE_MARKET_QUOTE",
    `Unexpected error: ${error.message}`,
  );

  const after = await snapshot(s);

  assert.equal(after.order.status, "PENDING");
  assert.equal(after.order.executedPrice, null);
  assert.equal(after.order.executedAt, null);

  assert.equal(after.positions.length, before.positions.length);

  assert.equal(after.trades.length, before.trades.length);

  assert.equal(after.balance, before.balance);
  assert.equal(after.equity, before.equity);

  passed++;

  console.log("[PASS] Quote expires while account lock is held");
}

async function rollbackAfterWriteScenario() {
  const s = await setup("BUY");

  const before = await snapshot(s);

  assert.equal(before.order.status, "PENDING");
  assert.equal(before.positions.length, 0);
  assert.equal(before.trades.length, 0);

  const rollbackError = new Error("E2E_FORCED_TRANSACTION_ROLLBACK");

  let orderWriteConfirmed = false;
  let accountWriteConfirmed = false;

  // Force an error AFTER two successful writes.
  await assert.rejects(
    db.transaction(async (tx) => {
      // Acquire the same account lock used by the
      // production order execution path.
      const plan = db.raw.sql`
        SELECT "id"
        FROM "public"."demoAccount"
        WHERE "id" = ${s.accountId}
        FOR UPDATE
      `
        .returnsRow({
          id: { codecId: "pg/text@1" },
        })
        .build();

      const rows = await tx.query(plan);

      assert.equal(rows.length, 1);

      // Write 1: transition the original order to FILLED.
      const updatedOrder = await tx.orm.public.Order.where({
        id: s.orderId,
        accountId: s.accountId,
        status: "PENDING",
      }).update({
        status: "FILLED",
        executedPrice: s.limitPrice.toFixed(2),
        executedAt: new Date().toISOString(),
      });

      assert.ok(updatedOrder);
      assert.equal(updatedOrder.status, "FILLED");

      orderWriteConfirmed = true;

      // Write 2: change account equity in the same transaction.
      const updatedAccount = await tx.orm.public.DemoAccount.where({
        id: s.accountId,
      }).update({
        equity: (before.equity + 1).toFixed(2),
      });

      assert.ok(updatedAccount);

      assert.equal(Number(updatedAccount.equity), before.equity + 1);

      accountWriteConfirmed = true;

      // Both writes succeeded. Now force transaction failure.
      throw rollbackError;
    }),
    (error: unknown) => error === rollbackError,
  );

  // Make sure the test actually reached both writes.
  assert.equal(orderWriteConfirmed, true);
  assert.equal(accountWriteConfirmed, true);

  // Read the database AFTER the transaction has rejected.
  const after = await snapshot(s);

  // The order transition must be rolled back.
  assert.equal(after.order.status, "PENDING");
  assert.equal(after.order.executedPrice, null);
  assert.equal(after.order.executedAt, null);

  // The account update must also be rolled back.
  assert.equal(after.balance, before.balance);
  assert.equal(after.equity, before.equity);

  // No unrelated records should have appeared.
  assert.equal(after.positions.length, before.positions.length);

  assert.equal(after.trades.length, before.trades.length);

  passed++;

  console.log("[PASS] Forced error after DB writes -> full rollback");
}

async function main() {
  safety();

  console.log("Testing Limit Order execution on isolated database");

  await scenario("BUY");
  await scenario("SELL");

  await concurrentScenario();
  await staleQuoteScenario();

  // Phase B.3: transaction safety.
  await insufficientMarginScenario();
  await invalidStopsScenario();
  await quoteExpiresWhileWaitingForLockScenario();
  await rollbackAfterWriteScenario();

  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
