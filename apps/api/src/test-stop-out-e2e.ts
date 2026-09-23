import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "./database/prisma.js";
import {
  executeStopOutPosition,
} from "./modules/orders/service.js";

import type { MarketPriceResponse } from "./modules/market/types.js";

let passed = 0;

interface FixtureIdentity {
  userId: string;
  accountId: string;
}

const fixturesToCleanup: FixtureIdentity[] = [];

async function cleanupFixture(
  fixture: FixtureIdentity,
): Promise<void> {
  await db.transaction(async (tx) => {
    // DELETE ... RETURNING gives this ORM a typed result row,
    // allowing us to use the already-proven
    // returnsRow(...).build() -> tx.query(plan) path.

    const tradePlan = db.raw.sql`
      DELETE FROM "public"."trade"
      WHERE "accountId" = ${fixture.accountId}
      RETURNING "id"
    `
      .returnsRow({
        id: { codecId: "pg/text@1" },
      })
      .build();

    const orderPlan = db.raw.sql`
      DELETE FROM "public"."order"
      WHERE "accountId" = ${fixture.accountId}
      RETURNING "id"
    `
      .returnsRow({
        id: { codecId: "pg/text@1" },
      })
      .build();

    const positionPlan = db.raw.sql`
      DELETE FROM "public"."position"
      WHERE "accountId" = ${fixture.accountId}
      RETURNING "id"
    `
      .returnsRow({
        id: { codecId: "pg/text@1" },
      })
      .build();

    const accountPlan = db.raw.sql`
      DELETE FROM "public"."demoAccount"
      WHERE "id" = ${fixture.accountId}
        AND "userId" = ${fixture.userId}
      RETURNING "id"
    `
      .returnsRow({
        id: { codecId: "pg/text@1" },
      })
      .build();

    const userPlan = db.raw.sql`
      DELETE FROM "public"."user"
      WHERE "id" = ${fixture.userId}
      RETURNING "id"
    `
      .returnsRow({
        id: { codecId: "pg/text@1" },
      })
      .build();

    await tx.query(tradePlan);
    await tx.query(orderPlan);
    await tx.query(positionPlan);

    const deletedAccounts =
      await tx.query(accountPlan);

    const deletedUsers =
      await tx.query(userPlan);

    if (deletedAccounts.length !== 1) {
      throw new Error(
        `Cleanup expected 1 DemoAccount; got ${deletedAccounts.length}`,
      );
    }

    if (deletedUsers.length !== 1) {
      throw new Error(
        `Cleanup expected 1 User; got ${deletedUsers.length}`,
      );
    }
  });
}

async function cleanupAllFixtures(): Promise<void> {
  const failures: unknown[] = [];

  for (const fixture of fixturesToCleanup.reverse()) {
    try {
      await cleanupFixture(fixture);
    } catch (error) {
      failures.push(error);
      console.error(
        `[CLEANUP ERROR] account=${fixture.accountId}`,
        error,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Fixture cleanup failed ${failures.length} time(s)`,
    );
  }
}

function safety(): void {
  const actual = process.env.DATABASE_URL;
  const expected = process.env.TEST_DATABASE_URL;

  if (!actual || !expected || actual !== expected) {
    throw new Error(
      "SAFETY ABORT: DATABASE_URL must equal TEST_DATABASE_URL",
    );
  }

  const databaseName = new URL(actual).pathname.replace(/^\//, "");

  if (databaseName !== "gold_trading_test") {
    throw new Error(
      `SAFETY ABORT: expected gold_trading_test; got ${databaseName}`,
    );
  }

  if (process.env.MARKET_DATA_PROVIDER !== "demo") {
    throw new Error(
      "SAFETY ABORT: MARKET_DATA_PROVIDER must be demo",
    );
  }

  if (process.env.STOP_WORKER_ENABLED !== "false") {
    throw new Error(
      "SAFETY ABORT: STOP_WORKER_ENABLED must be false",
    );
  }

  if (process.env.LIMIT_WORKER_ENABLED !== "false") {
    throw new Error(
      "SAFETY ABORT: LIMIT_WORKER_ENABLED must be false",
    );
  }
}

function makeQuote(
  bid: number,
  ask: number,
): MarketPriceResponse {
  const timestamp = new Date().toISOString();

  return {
    symbol: "XAUUSD",
    bid: bid.toFixed(2),
    ask: ask.toFixed(2),
    last: ((bid + ask) / 2).toFixed(2),
    source: "e2e-controlled-quote",
    timestamp,
  };
}

async function assertRuntimeDatabase(): Promise<void> {
  const databaseName = await db.transaction(async (tx) => {
    const plan = db.raw.sql`
      SELECT current_database() AS "databaseName"
    `
      .returnsRow({
        databaseName: { codecId: "pg/text@1" },
      })
      .build();

    const rows = await tx.query(plan);

    assert.equal(rows.length, 1);

    return rows[0].databaseName;
  });

  assert.equal(
    databaseName,
    "gold_trading_test",
    "Runtime ORM must use gold_trading_test",
  );
}

async function setup(
  balance: number,
  quantity: number,
  entryPrice: number,
) {
  const suffix = randomUUID();

  const user = await db.orm.public.User.create({
    email: `stop-out-${suffix}@example.com`,
    passwordHash: `test-${suffix}`,
  });

  const account = await db.orm.public.DemoAccount.create({
    userId: user.id,
    accountNumber: `STOP-${suffix}`,
    currency: "USD",

    initialBalance: String(balance),
    balance: String(balance),
    equity: String(balance),

    minimumDeposit: "0",
    maxLeverage: "100",

    commissionType: "NONE",
    commissionValue: "0",

    minimumSpread: "0",
    markup: "0",

    marginCallLevel: "100",
    stopOutLevel: "50",

    status: "ACTIVE",
  });

  fixturesToCleanup.push({
    userId: user.id,
    accountId: account.id,
  });

  const position = await db.orm.public.Position.create({
    accountId: account.id,
    symbol: "XAUUSD",
    side: "LONG",

    quantity: String(quantity),
    averageEntryPrice: entryPrice.toFixed(2),
    currentPrice: entryPrice.toFixed(2),
    unrealizedPnl: "0",

    stopLoss: null,
    takeProfit: null,

    status: "OPEN",
  });

  return {
    userId: user.id,
    accountId: account.id,
    positionId: position.id,
    initialBalance: balance,
    quantity,
    entryPrice,
  };
}

async function snapshot(
  accountId: string,
  positionId: string,
) {
  const [account, position, orders, trades] =
    await Promise.all([
      db.orm.public.DemoAccount.where({
        id: accountId,
      }).first(),

      db.orm.public.Position.where({
        id: positionId,
        accountId,
      }).first(),

      db.orm.public.Order.where({
        accountId,
      }).all(),

      db.orm.public.Trade.where({
        accountId,
      }).all(),
    ]);

  assert.ok(account);
  assert.ok(position);

  return {
    account,
    position,
    orders,
    trades,
  };
}

function nearly(
  actual: number,
  expected: number,
  message: string,
): void {
  assert.ok(
    Number.isFinite(actual) &&
      Number.isFinite(expected) &&
      Math.abs(actual - expected) < 0.011,
    `${message}: expected ${expected.toFixed(2)}, got ${actual}`,
  );
}

/**
 * Scenario 1
 *
 * LONG 1 lot @ 3650.
 * Balance = 1000.
 *
 * Quote = 3600 / 3600.20
 *
 * Unrealized P&L:
 *   (3600 - 3650) * 1 * 100 = -5000
 *
 * Equity becomes deeply negative, therefore STOP_OUT.
 *
 * executeStopOutPosition must:
 * - close the full position,
 * - create exactly one closing order,
 * - create exactly one closing trade,
 * - realize the P&L into balance.
 */
async function stopOutClosesPosition(): Promise<void> {
  const s = await setup(
    1000,
    1,
    3650,
  );

  const quote = makeQuote(
    3600,
    3600.2,
  );

  const result = await executeStopOutPosition(
    s.userId,
    s.positionId,
    quote,
  );

  assert.ok(
    result,
    "STOP_OUT account must be liquidated",
  );

  const after = await snapshot(
    s.accountId,
    s.positionId,
  );

  assert.equal(
    after.position.status,
    "CLOSED",
  );

  assert.equal(
    Number(after.position.quantity),
    0,
  );

  assert.equal(
    after.orders.length,
    1,
  );

  assert.equal(
    after.trades.length,
    1,
  );

  const expectedPnl =
    (3600 - s.entryPrice) *
    s.quantity *
    100;

  nearly(
    Number(after.account.balance),
    s.initialBalance + expectedPnl,
    "STOP_OUT realized balance",
  );

  nearly(
    Number(after.trades[0].realizedPnl),
    expectedPnl,
    "STOP_OUT trade realized P&L",
  );

  passed++;

  console.log(
    "[PASS] STOP_OUT -> full forced close",
  );
}

/**
 * Scenario 2
 *
 * Fixture initially exists, but the quote supplied to the
 * transaction is healthy. The risk recheck under account lock
 * must therefore return null and write nothing.
 */
async function recoveredAccountDoesNothing(): Promise<void> {
  const s = await setup(
    100000,
    0.01,
    3650,
  );

  const before = await snapshot(
    s.accountId,
    s.positionId,
  );

  const quote = makeQuote(
    3650,
    3650.2,
  );

  const result = await executeStopOutPosition(
    s.userId,
    s.positionId,
    quote,
  );

  assert.equal(
    result,
    null,
    "Recovered account must not be liquidated",
  );

  const after = await snapshot(
    s.accountId,
    s.positionId,
  );

  assert.equal(
    after.position.status,
    "OPEN",
  );

  assert.equal(
    String(after.position.quantity),
    String(before.position.quantity),
  );

  assert.equal(
    after.orders.length,
    before.orders.length,
  );

  assert.equal(
    after.trades.length,
    before.trades.length,
  );

  assert.equal(
    String(after.account.balance),
    String(before.account.balance),
  );

  passed++;

  console.log(
    "[PASS] Recovered risk -> null and zero writes",
  );
}

/**
 * Scenario 3
 *
 * First execution closes the position.
 * A second automatic execution against the same position must
 * not create another Order/Trade.
 */
async function duplicateExecutionDoesNothing(): Promise<void> {
  const s = await setup(
    1000,
    1,
    3650,
  );

  const quote = makeQuote(
    3600,
    3600.2,
  );

  const first = await executeStopOutPosition(
    s.userId,
    s.positionId,
    quote,
  );

  assert.ok(first);

  const afterFirst = await snapshot(
    s.accountId,
    s.positionId,
  );

  const second = await executeStopOutPosition(
    s.userId,
    s.positionId,
    quote,
  );

  assert.equal(
    second,
    null,
    "Already closed position must be ignored",
  );

  const afterSecond = await snapshot(
    s.accountId,
    s.positionId,
  );

  assert.equal(
    afterSecond.position.status,
    "CLOSED",
  );

  assert.equal(
    afterSecond.orders.length,
    afterFirst.orders.length,
  );

  assert.equal(
    afterSecond.trades.length,
    afterFirst.trades.length,
  );

  assert.equal(
    String(afterSecond.account.balance),
    String(afterFirst.account.balance),
  );

  passed++;

  console.log(
    "[PASS] Already closed -> no duplicate Order/Trade",
  );
}

async function main(): Promise<void> {
  safety();

  await assertRuntimeDatabase();

  try {
    await stopOutClosesPosition();
    await recoveredAccountDoesNothing();
    await duplicateExecutionDoesNothing();

    console.log("");
    console.log(
      `[PASS] Stop-Out Transaction Regression: ${passed}/3 tests`,
    );
  } finally {
    await cleanupAllFixtures();

    console.log(
      `[PASS] Fixture cleanup: ${fixturesToCleanup.length} account(s)`,
    );
  }
}

main()
  .then(async () => {
    await db.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);

    try {
      await db.close();
    } catch {
      // Preserve original error.
    }

    process.exit(1);
  });