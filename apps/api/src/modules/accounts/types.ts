export type AccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface AccountResponse {
  id: string;
  accountNumber: string;
  currency: string;
  initialBalance: string;
  balance: string;
  equity: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AccountBalanceResponse {
  accountId: string;
  accountNumber: string;
  currency: string;
  balance: string;
  equity: string;
  unrealizedPnl: string;
}
