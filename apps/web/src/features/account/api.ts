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

export async function getAccounts(): Promise<DemoAccount[]> {
  const response = await api.get<ApiResponse<DemoAccount[]>>("/accounts");

  return response.data.data;
}

export async function getAccountBalance(): Promise<AccountBalance> {
  const response =
    await api.get<ApiResponse<AccountBalance>>("/accounts/balance");

  return response.data.data;
}
