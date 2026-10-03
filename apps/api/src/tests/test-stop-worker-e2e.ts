/**
 * E2E: real HTTP order creation + real database + real stop execution.
 * Run only with a dedicated test database and API STOP_WORKER_ENABLED=false.
 * From apps/api: pnpm exec tsx src/test-stop-worker-e2e.ts
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../database/prisma.js";
import { getMarketPrice } from "../modules/market/service.js";
import {
  createStopWorker,
  defaultStopWorkerDependencies,
} from "../modules/orders/stop-worker.js";
import {
  getMyOrders,
  getMyTrades,
  getMyPosition,
} from "../modules/orders/service.js";
import type { MarketPriceResponse } from "../modules/market/types.js";

const base = (
  process.env.TEST_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");
let passed = 0;

function safety(): void {
  if (process.env.MARKET_DATA_PROVIDER !== "demo")
    throw new Error("MARKET_DATA_PROVIDER must be demo");
  if (process.env.STOP_WORKER_ENABLED !== "false")
    throw new Error(
      "STOP_WORKER_ENABLED must explicitly be false in test process AND API server",
    );
  const actual = process.env.DATABASE_URL;
  const expected = process.env.TEST_DATABASE_URL;
  if (!actual || !expected || actual !== expected) {
    throw new Error(
      "Set TEST_DATABASE_URL to the exact DATABASE_URL of your isolated test database (same DB as API).",
    );
  }
  const databaseName = new URL(actual).pathname.replace(/^\//, "");
  if (!/(test|testing|e2e)/i.test(databaseName))
    throw new Error("Database name must contain test/testing/e2e");
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
  const json: any = await response.json();
  if (!response.ok || !json.success)
    throw new Error(
      `${method} ${path}: HTTP ${response.status}: ${JSON.stringify(json)}`,
    );
  return json.data;
}

async function setup(side: "BUY" | "SELL") {
  const email = `worker-e2e-${randomUUID()}@example.com`;
  const password = "Test@123456";
  await api("/auth/register", "POST", undefined, {
    email,
    password,
    fullName: "Stop Worker E2E",
  });
  const login = await api("/auth/login", "POST", undefined, {
    email,
    password,
  });
  const token: string = login.accessToken;
  const account = await api("/accounts/demo", "POST", token);
  const dbUser = await db.orm.public.User.where({ email }).first();
  assert.ok(
    dbUser,
    "API and test process must connect to the SAME isolated database",
  );
  const initial = await getMarketPrice("XAUUSD");
  const bid = Number(initial.bid),
    ask = Number(initial.ask);
  assert.ok(bid > 100 && ask >= bid);
  const sl = side === "BUY" ? bid - 20 : ask + 20;
  const tp = side === "BUY" ? bid + 20 : ask - 20;
  const opened = await api("/orders", "POST", token, {
    symbol: "XAUUSD",
    side,
    orderType: "MARKET",
    quantity: "0.01",
    stopLoss: sl.toFixed(2),
    takeProfit: tp.toFixed(2),
  });
  assert.equal(opened.position.status, "OPEN");
  return {
    userId: dbUser.id,
    accountId: account.id as string,
    positionId: opened.position.id as string,
    side,
    sl,
    tp,
  };
}

type Scenario = Awaited<ReturnType<typeof setup>>;
function movedQuote(s: Scenario, kind: "SL" | "TP"): MarketPriceResponse {
  const target = kind === "SL" ? s.sl : s.tp;
  const bid = s.side === "BUY" ? target : target - 0.2;
  const ask = s.side === "BUY" ? target + 0.2 : target;
  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "e2e-controlled-quote",
    timestamp: new Date().toISOString(),
  };
}

async function snapshot(s: Scenario) {
  const [position, orders, trades, account] = await Promise.all([
    getMyPosition(s.userId, s.positionId),
    getMyOrders(s.userId),
    getMyTrades(s.userId),
    db.orm.public.DemoAccount.where({ id: s.accountId }).first(),
  ]);
  assert.ok(account);
  return {
    position,
    orders: orders.items.length,
    trades: trades.items.length,
    balance: Number(account.balance),
    equity: Number(account.equity),
  };
}

async function scenario(side: "BUY" | "SELL", kind: "SL" | "TP") {
  const s = await setup(side);
  const before = await snapshot(s);
  const errors: string[] = [];
  let currentQuote = await getMarketPrice("XAUUSD");
  const executed: unknown[] = [];
  const worker = createStopWorker(
    {
      ...defaultStopWorkerDependencies,
      // Scope to the single account created by THIS scenario; never scan unrelated positions.
      async listPositions() {
        const position = await db.orm.public.Position.where({
          id: s.positionId,
          accountId: s.accountId,
          status: "OPEN",
        }).first();
        return position
          ? [
              {
                id: position.id,
                accountId: position.accountId,
                side: position.side,
                stopLoss:
                  position.stopLoss == null ? null : String(position.stopLoss),
                takeProfit:
                  position.takeProfit == null
                    ? null
                    : String(position.takeProfit),
              },
            ]
          : [];
      },
      getQuote: async () => currentQuote,
      async execute(userId, positionId, quote) {
        const result = await defaultStopWorkerDependencies.execute(
          userId,
          positionId,
          quote,
        );
        executed.push(result);
        return result;
      },
      logError(error, context) {
        errors.push(`${context}: ${String(error)}`);
      },
    },
    { maxQuoteAgeMs: 5000 },
  );

  try {
    await worker.tick();
    const unchanged = await snapshot(s);
    assert.equal(
      unchanged.position.status,
      "OPEN",
      "Untriggered quote must not close position",
    );
    assert.equal(unchanged.orders, before.orders);
    assert.equal(unchanged.trades, before.trades);
    assert.equal(executed.length, 0);

    currentQuote = movedQuote(s, kind);
    await worker.tick();
    const after = await snapshot(s);
    assert.deepEqual(errors, [], "Worker must not log errors");
    assert.equal(executed.length, 1, "Worker must execute exactly once");
    const result = executed[0] as any;
    assert.ok(result, "Stop execution must return a close result");
    assert.equal(after.position.status, "CLOSED");
    assert.equal(Number(after.position.quantity), 0);
    assert.equal(after.orders, before.orders + 1);
    assert.equal(after.trades, before.trades + 1);
    const expectedPrice = Number(
      s.side === "BUY" ? currentQuote.bid : currentQuote.ask,
    );
    assert.equal(Number(result.order.executedPrice), expectedPrice);
    assert.ok(
      Math.abs(after.balance - before.balance - Number(result.realizedPnl)) <
        0.011,
    );
    assert.ok(Math.abs(after.equity - after.balance) < 0.011);
    const closingTrades = (await getMyTrades(s.userId)).items.filter(
      (t) => t.positionId === s.positionId && t.realizedPnl !== null,
    );
    assert.equal(closingTrades.length, 1);
    assert.equal(Number(closingTrades[0].exitPrice), expectedPrice);
    assert.equal(
      Number(closingTrades[0].realizedPnl),
      Number(result.realizedPnl),
    );

    // More worker cycles must not generate duplicate closing records.
    for (let i = 0; i < 3; i++) await worker.tick();
    const repeated = await snapshot(s);
    assert.equal(repeated.orders, after.orders);
    assert.equal(repeated.trades, after.trades);
    assert.equal(repeated.balance, after.balance);
    assert.equal(executed.length, 1);
    assert.deepEqual(errors, []);
    passed++;
    console.log(
      `[PASS] E2E ${side} ${kind}: no trigger -> market move -> close/accounting -> no duplicates`,
    );
  } finally {
    await worker.stop();
  }
}

async function staleQuoteWhileWaitingForLock(): Promise<void> {
  const s = await setup("BUY");
  const before = await snapshot(s);

  const previousMaxAge = process.env.STOP_WORKER_MAX_QUOTE_AGE_MS;
  process.env.STOP_WORKER_MAX_QUOTE_AGE_MS = "200";

  let signalLocked!: () => void;
  let releaseLock!: () => void;

  const locked = new Promise<void>((resolve) => {
    signalLocked = resolve;
  });

  const released = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  let lockAcquired = false;

  // Transaction A giữ khóa trên đúng demoAccount của scenario này.
  const holdingTransaction = db.transaction(async (tx) => {
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

    lockAcquired = true;
    signalLocked();

    await released;
  });

  try {
    // Chờ transaction A thực sự lấy được khóa.
    await Promise.race([
      locked,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout acquiring test lock")),
          3000,
        ),
      ),
    ]);

    assert.equal(lockAcquired, true);

    // Quote được tạo SAU KHI transaction A đã lấy khóa.
    const quote = movedQuote(s, "SL");

    // Transaction B sẽ phải chờ khóa trong closePositionInternal().
    const execution = defaultStopWorkerDependencies.execute(
      s.userId,
      s.positionId,
      quote,
    );

    // Gắn rejection handler ngay để tránh unhandled rejection
    // trong lúc transaction A vẫn giữ khóa.
    const outcome = execution.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // Ngưỡng quote = 200 ms; giữ khóa lâu hơn ngưỡng.
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Giải phóng khóa để transaction B tiếp tục.
    releaseLock();
    await holdingTransaction;

    const result = await outcome;

    assert.equal(
      result.ok,
      false,
      "Stale quote must not execute a closing order",
    );

    if (result.ok) {
      throw new Error("Unexpected successful stop execution");
    }

    const errorCode = (result.error as { code?: string }).code;

    assert.equal(
      errorCode,
      "STALE_MARKET_QUOTE",
      `Expected STALE_MARKET_QUOTE, received: ${String(result.error)}`,
    );

    const after = await snapshot(s);

    assert.equal(after.position.status, "OPEN");
    assert.equal(after.orders, before.orders);
    assert.equal(after.trades, before.trades);
    assert.equal(after.balance, before.balance);
    assert.equal(after.equity, before.equity);

    passed++;

    console.log(
      "[PASS] E2E stale quote while waiting for account lock: rejected, no database changes",
    );
  } finally {
    // Không để transaction giữ khóa nếu assertion thất bại.
    releaseLock();

    await holdingTransaction;

    if (previousMaxAge === undefined) {
      delete process.env.STOP_WORKER_MAX_QUOTE_AGE_MS;
    } else {
      process.env.STOP_WORKER_MAX_QUOTE_AGE_MS = previousMaxAge;
    }
  }
}

async function main() {
  safety();
  console.log(
    "E2E uses isolated TEST_DATABASE_URL; API worker MUST be disabled; test worker scopes to its own positions.",
  );
  for (const side of ["BUY", "SELL"] as const) {
    for (const kind of ["SL", "TP"] as const) await scenario(side, kind);
  }

  await staleQuoteWhileWaitingForLock();
  console.log(`RESULT: passed=${passed} failed=0`);
}

main().catch((error) => {
  console.error("[FAIL]", error);
  console.error(`RESULT: passed=${passed} failed=1`);
  process.exitCode = 1;
});
