import { api } from "../../lib/api";

export interface Position {
  id: string;
  symbol: "XAUUSD";
  side: "LONG" | "SHORT";
  quantity: string;
  averageEntryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  stopLoss: string | null;
  takeProfit: string | null;
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

export interface ClosePositionInput {
  positionId: string;
  quantity?: string;
}

export async function closePosition({
  positionId,
  quantity,
}: ClosePositionInput): Promise<void> {
  await api.post(
    `/orders/positions/${positionId}/close`,
    quantity === undefined ? {} : { quantity },
  );
}


export interface UpdatePositionStopsInput {
  positionId: string;
  stopLoss: string | null;
  takeProfit: string | null;
}

export async function updatePositionStops({
  positionId,
  stopLoss,
  takeProfit,
}: UpdatePositionStopsInput): Promise<void> {
  await api.patch(`/orders/positions/${positionId}/stops`, {
    stopLoss,
    takeProfit,
  });
}
