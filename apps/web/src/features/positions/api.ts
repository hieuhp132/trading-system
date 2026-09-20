import { api } from "../../lib/api";

export interface Position {
  id: string;
  symbol: "XAUUSD";
  side: "LONG" | "SHORT";
  quantity: string;
  averageEntryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
}

interface PositionsResponse {
  success: boolean;
  data: {
    items: Position[];
    total: number;
  };
}

export async function getPositions(): Promise<Position[]> {
  const response = await api.get<PositionsResponse>("/orders/positions");

  return response.data.data.items;
}

export async function closePosition(positionId: string): Promise<void> {
  await api.post(`/orders/positions/${positionId}/close`);
}
