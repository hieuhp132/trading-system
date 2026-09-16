import { randomBytes } from "node:crypto";

import { AppError } from "../../common/errors/app-error";
import { db } from "../../database/prisma";

import type { AccountBalanceResponse, AccountResponse } from "./types";

const DEMO_ACCOUNT_INITIAL_BALANCE = "100000";
const DEMO_ACCOUNT_CURRENCY = "USD";

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

  const unrealizedPnl = Number(account.equity) - Number(account.balance);

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    currency: account.currency,
    balance: String(account.balance),
    equity: String(account.equity),
    unrealizedPnl: unrealizedPnl.toFixed(2),
  };
}
