export type AccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

export type CommissionType = "NONE" | "PER_LOT" | "PERCENT";

export interface AccountResponse {
  id: string;
  accountNumber: string;
  currency: string;

  initialBalance: string;
  balance: string;
  equity: string;

  minimumDeposit: string;
  maxLeverage: string;

  commissionType: CommissionType;
  commissionValue: string;

  minimumSpread: string;
  markup: string;

  marginCallLevel: string;
  stopOutLevel: string;

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

  usedMargin: string;
  freeMargin: string;
  marginLevel: string | null;
}

export interface AccountBalanceHistoryPoint {
  time: number;
  balance: string;
  equity: string;
}

export interface AccountBalanceHistoryResponse {
  accountId: string;
  currency: string;
  points: AccountBalanceHistoryPoint[];
}

export interface AccountTradingConditions {
  currency: string;

  minimumDeposit: string;
  maxLeverage: string;

  commissionType: CommissionType;
  commissionValue: string;

  minimumSpread: string;
  markup: string;

  marginCallLevel: string;
  stopOutLevel: string;

  symbol: "XAUUSD";

  contractSize: string;
  minVolume: string;
  maxVolume: string;
  volumeStep: string;
  pricePrecision: number;
}
