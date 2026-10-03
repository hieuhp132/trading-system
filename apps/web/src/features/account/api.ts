import { api } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

export interface DemoAccount {
  id: string;
  accountNumber: string;
  currency: string;
  balance: string;
  equity: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export interface AccountBalance {
  accountId: string;
  accountNumber: string;
  balance: string;
  equity: string;
  unrealizedPnl: string;
  usedMargin: string;
  freeMargin: string;
  marginLevel: string | null;
  currency: string;
}

export interface AccountBalanceHistory {
  accountId: string;
  currency: string;
  points: Array<{
    time: number;
    balance: string;
    equity: string;
  }>;
}

const ACCOUNT_BALANCE_STORAGE_KEY = "gold-account-balance-v1";

function isPlaceholderAccountBalance(account: unknown): boolean {
  if (!account || typeof account !== "object") {
    return true;
  }

  const candidate = account as Record<string, unknown>;

  return (
    candidate.balance === "0.00" &&
    candidate.equity === "0.00" &&
    candidate.unrealizedPnl === "0.00" &&
    candidate.usedMargin === "0.00" &&
    candidate.freeMargin === "0.00"
  );
}

export function getLastKnownAccountBalance(): AccountBalance | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_BALANCE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as AccountBalance | null;

    if (!parsed || typeof parsed !== "object" || isPlaceholderAccountBalance(parsed)) {
      localStorage.removeItem(ACCOUNT_BALANCE_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(ACCOUNT_BALANCE_STORAGE_KEY);
    return null;
  }
}

export function setLastKnownAccountBalance(account: AccountBalance): void {
  if (isPlaceholderAccountBalance(account)) {
    localStorage.removeItem(ACCOUNT_BALANCE_STORAGE_KEY);
    return;
  }

  localStorage.setItem(
    ACCOUNT_BALANCE_STORAGE_KEY,
    JSON.stringify(account),
  );
}

export async function getAccounts(): Promise<DemoAccount[]> {
  const response = await api.get<ApiResponse<DemoAccount[]>>("/accounts");

  return response.data.data;
}

export async function createDemoAccount(): Promise<DemoAccount> {
  const response = await api.post<ApiResponse<DemoAccount>>("/accounts/demo");

  return response.data.data;
}

export async function getAccountBalance(): Promise<AccountBalance> {
  const response =
    await api.get<ApiResponse<AccountBalance>>("/accounts/balance");

  return response.data.data;
}

export async function getAccountBalanceHistory(): Promise<AccountBalanceHistory> {
  const response = await api.get<ApiResponse<AccountBalanceHistory>>(
    "/accounts/balance-history",
  );

  return response.data.data;
}
