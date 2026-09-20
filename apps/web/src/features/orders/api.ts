import { api } from "../../lib/api";

export type OrderSide = "BUY" | "SELL";

export type OrderType = "MARKET";

export type OrderStatus = "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";

export interface CreateOrderInput {
  symbol: "XAUUSD";
  side: OrderSide;
  type: OrderType;
  quantity: string;
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

/**
 * Create MARKET order
 *
 * BUY  -> LONG
 * SELL -> SHORT
 */
export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse["data"]> {
  const response = await api.post<CreateOrderResponse>("/orders", input);

  return response.data.data;
}

/**
 * Get order history
 */
export async function getOrders(): Promise<Order[]> {
  const response = await api.get<OrdersResponse>("/orders");

  return response.data.data.items;
}
