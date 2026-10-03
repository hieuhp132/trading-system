import { api } from "../../lib/api";

export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET" | "BUY_LIMIT" | "SELL_LIMIT";

export type OrderStatus = "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";

export interface CreateOrderInput {
  symbol: "XAUUSD";
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
}

export interface Order {
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
  realizedPnl: string | null;
  createdAt: string;
  executedAt: string | null;
}

export interface CreateOrderResponse {
  success: boolean;
  data: {
    order: Order;
    account: {
      accountId: string;
      accountNumber: string;
      balance: string;
      equity: string;
      unrealizedPnl: string;
    };
    position: {
      id: string;
      symbol: "XAUUSD";
      side: "LONG" | "SHORT";
      quantity: string;
      averageEntryPrice: string;
      currentPrice: string | null;
      unrealizedPnl: string;
      status: "OPEN" | "CLOSED";
    } | null;
    realizedPnl: string;
  };
}

interface OrdersResponse {
  success: boolean;
  data: {
    items: Order[];
    total: number;
  };
}

export interface CancelOrderResponse {
  success: boolean;
  data: Order;
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const response = await api.post<CancelOrderResponse>(
    `/orders/${encodeURIComponent(orderId)}/cancel`,
  );

  return response.data.data;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse["data"]> {
  const response = await api.post<CreateOrderResponse>("/orders", input);

  return response.data.data;
}

export async function getOrders(): Promise<Order[]> {
  const response = await api.get<OrdersResponse>("/orders");

  return response.data.data.items;
}
