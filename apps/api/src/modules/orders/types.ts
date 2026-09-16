export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET";

export type OrderStatus = "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";

export type PositionSide = "LONG" | "SHORT";

export type PositionStatus = "OPEN" | "CLOSED";

export interface CreateOrderResponse {
  id: string;
  accountId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  requestedPrice: string | null;
  executedPrice: string | null;
  status: OrderStatus;
  commission: string;
  createdAt: string;
  executedAt: string | null;
}

export interface OrderExecutionPositionResponse {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: string;
  averageEntryPrice: string;
  currentPrice: string | null;
  unrealizedPnl: string;
  status: PositionStatus;
}

export interface PositionResponse extends OrderExecutionPositionResponse {
  openedAt: string;
  closedAt: string | null;
}

export interface TradeResponse {
  id: string;
  orderId: string;
  positionId: string | null;
  symbol: string;
  side: OrderSide;
  quantity: string;
  entryPrice: string | null;
  exitPrice: string | null;
  realizedPnl: string | null;
  commission: string;
  openedAt: string;
  closedAt: string | null;
}

export interface OrderExecutionResponse {
  order: CreateOrderResponse;

  account: {
    accountId: string;
    accountNumber: string;
    balance: string;
    equity: string;
    unrealizedPnl: string;
  };

  position: OrderExecutionPositionResponse | null;

  realizedPnl: string;
}

export interface OrdersListResponse {
  items: CreateOrderResponse[];
  total: number;
}

export interface PositionsListResponse {
  items: PositionResponse[];
  total: number;
}

export interface TradesListResponse {
  items: TradeResponse[];
  total: number;
}

export interface PortfolioSummaryPosition {
  id: string;
  symbol: string;
  side: PositionSide;
  quantity: string;
  averageEntryPrice: string;
  currentPrice: string | null;
  unrealizedPnl: string;
  status: PositionStatus;
  openedAt: string;
}
export interface PortfolioSummaryOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  requestedPrice: string | null;
  executedPrice: string | null;
  status: OrderStatus;
  commission: string;
  createdAt: string;
  executedAt: string | null;
}
export interface PortfolioSummaryResponse {
  account: { id: string; accountNumber: string; currency: string };
  balance: string;
  equity: string;
  realizedPnl: string;
  unrealizedPnl: string;
  openPositions: number;
  openOrders: number;
  positions: PortfolioSummaryPosition[];
  recentOrders: PortfolioSummaryOrder[];
}
