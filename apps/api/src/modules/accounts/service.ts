import { randomBytes } from "node:crypto";

import { AppError } from "../../common/errors/app-error.js";
import { db } from "../../database/prisma.js";
import { getMarketPrice } from "../market/service.js";
import { calculateUnrealizedPnl, roundMoney } from "../../common/utils/pnl.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import { isMarketClosedByWeekend } from "../market/market-hours.js";

import type {
  AccountBalanceResponse,
  AccountBalanceHistoryResponse,
  AccountResponse,
  AccountTradingConditions,
  CommissionType,
} from "./types.js";

import { calculateUsedMargin } from "../../common/utils/margin.js";
const DEMO_ACCOUNT_INITIAL_BALANCE = "100000";
const DEMO_ACCOUNT_CURRENCY = "USD";

const DEFAULT_MINIMUM_DEPOSIT = "100000";
const DEFAULT_MAX_LEVERAGE = "100";

const DEFAULT_COMMISSION_TYPE: CommissionType = "NONE";
const DEFAULT_COMMISSION_VALUE = "0";

const DEFAULT_MINIMUM_SPREAD = "0";
const DEFAULT_MARKUP = "0";

const DEFAULT_MARGIN_CALL_LEVEL = "100";
const DEFAULT_STOP_OUT_LEVEL = "50";

const SUPPORTED_SYMBOL = "XAUUSD";

const CONTRACT_SIZE = 100;
const MIN_VOLUME = 0.01;
const MAX_VOLUME = 1000;
const VOLUME_STEP = 0.01;
const PRICE_PRECISION = 2;

function generateDemoAccountNumber(): string {
  const suffix = randomBytes(4).toString("hex").toUpperCase();

  return `DEMO-${suffix}`;
}

function toAccountResponse(account: {
  id: string;
  accountNumber: string;
  currency: string;
  initialBalance: unknown;
  balance: unknown;
  equity: unknown;

  minimumDeposit: unknown;
  maxLeverage: unknown;

  commissionType: "NONE" | "PER_LOT" | "PERCENT";
  commissionValue: unknown;

  minimumSpread: unknown;
  markup: unknown;

  marginCallLevel: unknown;
  stopOutLevel: unknown;

  status: "ACTIVE" | "SUSPENDED" | "CLOSED";

  createdAt: string;
  updatedAt: string;
}): AccountResponse {
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    currency: account.currency,

    initialBalance: String(account.initialBalance),
    balance: String(account.balance),
    equity: String(account.equity),

    minimumDeposit: String(account.minimumDeposit),
    maxLeverage: String(account.maxLeverage),

    commissionType: account.commissionType,
    commissionValue: String(account.commissionValue),

    minimumSpread: String(account.minimumSpread),
    markup: String(account.markup),

    marginCallLevel: String(account.marginCallLevel),
    stopOutLevel: String(account.stopOutLevel),

    status: account.status,

    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}


export async function createDemoAccount(
  userId: string,
): Promise<AccountResponse> {
  const existingAccount = await db.orm.public.DemoAccount.first({
    userId,
  });

  if (existingAccount) {
    throw new AppError(
      "Người dùng đã có tài khoản demo",
      409,
      "DEMO_ACCOUNT_ALREADY_EXISTS",
    );
  }

  let accountNumber = generateDemoAccountNumber();

  let existingAccountNumber = await db.orm.public.DemoAccount.first({
    accountNumber,
  });

  while (existingAccountNumber) {
    accountNumber = generateDemoAccountNumber();

    existingAccountNumber = await db.orm.public.DemoAccount.first({
      accountNumber,
    });
  }

  const account = await db.orm.public.DemoAccount.create({
    userId,
    accountNumber,

    currency: DEMO_ACCOUNT_CURRENCY,

    initialBalance: DEMO_ACCOUNT_INITIAL_BALANCE,
    balance: DEMO_ACCOUNT_INITIAL_BALANCE,
    equity: DEMO_ACCOUNT_INITIAL_BALANCE,

    minimumDeposit: DEFAULT_MINIMUM_DEPOSIT,
    maxLeverage: DEFAULT_MAX_LEVERAGE,

    commissionType: DEFAULT_COMMISSION_TYPE,
    commissionValue: DEFAULT_COMMISSION_VALUE,

    minimumSpread: DEFAULT_MINIMUM_SPREAD,
    markup: DEFAULT_MARKUP,

    marginCallLevel: DEFAULT_MARGIN_CALL_LEVEL,
    stopOutLevel: DEFAULT_STOP_OUT_LEVEL,

    status: "ACTIVE",
  });

  return toAccountResponse(account);
}

export async function getMyAccount(userId: string): Promise<AccountResponse> {
  const account = await db.orm.public.DemoAccount.first({
    userId,
  });

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  return toAccountResponse(account);
}

export async function getMyAccountBalance(
  userId: string,
): Promise<AccountBalanceResponse> {
  const account = await db.orm.public.DemoAccount.first({
    userId,
  });

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const positions = await db.orm.public.Position.where({
    accountId: account.id,
    status: "OPEN",
  }).all();

  const marketClosed = isMarketClosedByWeekend();

  let unrealizedPnl = 0;

  if (marketClosed) {
    unrealizedPnl = positions.reduce((total, position) => {
      const storedPnl = Number(position.unrealizedPnl ?? 0);
      return total + (Number.isFinite(storedPnl) ? storedPnl : 0);
    }, 0);
  } else {
    const marketPrice = await getMarketPrice(XAUUSD_SPEC.symbol);

    unrealizedPnl = positions.reduce((total, position) => {
      const volume = Number(position.quantity);
      const averageEntryPrice = Number(position.averageEntryPrice);

      const currentPrice =
        position.side === "LONG"
          ? Number(marketPrice.bid)
          : Number(marketPrice.ask);

      if (
        !Number.isFinite(volume) ||
        volume <= 0 ||
        !Number.isFinite(averageEntryPrice) ||
        averageEntryPrice <= 0 ||
        !Number.isFinite(currentPrice) ||
        currentPrice <= 0
      ) {
        throw new AppError(
          "Dữ liệu position hoặc market price không hợp lệ",
          502,
          "INVALID_ACCOUNT_MARKET_DATA",
        );
      }
      return (
        total +
        calculateUnrealizedPnl(
          position.side,
          volume,
          averageEntryPrice,
          currentPrice,
        )
      );
    }, 0);
  }

  const balance = Number(account.balance);

  if (!Number.isFinite(balance)) {
    throw new AppError(
      "Balance của tài khoản không hợp lệ",
      500,
      "INVALID_ACCOUNT_BALANCE",
    );
  }

  const leverage = Number(account.maxLeverage);

  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw new AppError(
      "Leverage của tài khoản không hợp lệ",
      500,
      "INVALID_ACCOUNT_LEVERAGE",
    );
  }

  const marginPositions = positions.map((position) => {
    const quantity = Number(position.quantity);
    const entryPrice = Number(position.averageEntryPrice);

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(entryPrice) ||
      entryPrice <= 0
    ) {
      throw new AppError(
        "Dữ liệu position không hợp lệ",
        500,
        "INVALID_POSITION_MARGIN_DATA",
      );
    }

    return {
      quantity,
      entryPrice,
    };
  });

  const usedMargin = calculateUsedMargin(
    marginPositions,
    leverage,
  );

  const equity = balance + unrealizedPnl;
  const freeMargin = equity - usedMargin;

  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    currency: account.currency,

    balance: String(account.balance),

    equity: roundMoney(equity),
    unrealizedPnl: roundMoney(unrealizedPnl),

    usedMargin: roundMoney(usedMargin),
    freeMargin: roundMoney(freeMargin),

    marginLevel: marginLevel === null ? null : roundMoney(marginLevel),
  };
}

export async function getMyAccountBalanceHistory(
  userId: string,
): Promise<AccountBalanceHistoryResponse> {
  const account = await db.orm.public.DemoAccount.first({ userId });

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  const currentBalance = await getMyAccountBalance(userId);
  const equityOffset = Number(currentBalance.equity) - Number(currentBalance.balance);

  const plan = db.raw.sql`
    SELECT
      date_trunc('day', "closedAt") AS "day",
      SUM("realizedPnl") AS "realizedPnl"
    FROM "public"."trade"
    WHERE "accountId" = ${account.id}
      AND "closedAt" IS NOT NULL
      AND "realizedPnl" IS NOT NULL
    GROUP BY date_trunc('day', "closedAt")
    ORDER BY "day" ASC
  `
    .returnsRow({
      day: { codecId: "pg/timestamptz-string@1" },
      realizedPnl: { codecId: "pg/numeric@1" },
    })
    .build();

  const rows = await db.transaction((tx) => tx.query(plan));
  const points: AccountBalanceHistoryResponse["points"] = [{
    time: Math.floor(Date.parse(account.createdAt) / 1000),
    balance: String(account.initialBalance),
    equity: roundMoney(Number(account.initialBalance) + equityOffset),
  }];
  let balance = Number(account.initialBalance);

  for (const row of rows) {
    balance += Number(row.realizedPnl);
    points.push({
      time: Math.floor(Date.parse(row.day) / 1000),
      balance: roundMoney(balance),
      equity: roundMoney(balance + equityOffset),
    });
  }

  const sortedPoints = [...points].sort(
    (a, b) => Number(a.time) - Number(b.time),
  );

  return {
    accountId: account.id,
    currency: account.currency,
    points: sortedPoints,
  };
}

export async function getMyAccountTradingConditions(
  userId: string,
): Promise<AccountTradingConditions> {
  const account = await db.orm.public.DemoAccount.first({
    userId,
  });

  if (!account) {
    throw new AppError(
      "Tài khoản demo không tồn tại",
      404,
      "DEMO_ACCOUNT_NOT_FOUND",
    );
  }

  return {
    currency: account.currency,

    minimumDeposit: String(account.minimumDeposit),
    maxLeverage: String(account.maxLeverage),

    commissionType: account.commissionType,
    commissionValue: String(account.commissionValue),

    minimumSpread: String(account.minimumSpread),
    markup: String(account.markup),

    marginCallLevel: String(account.marginCallLevel),
    stopOutLevel: String(account.stopOutLevel),

    symbol: XAUUSD_SPEC.symbol,

    contractSize: String(XAUUSD_SPEC.contractSize),
    minVolume: String(XAUUSD_SPEC.minVolume),
    maxVolume: String(XAUUSD_SPEC.maxVolume),
    volumeStep: String(XAUUSD_SPEC.volumeStep),
    pricePrecision: XAUUSD_SPEC.pricePrecision,
  };
}
