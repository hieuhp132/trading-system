import type { PositionSide } from "../../modules/orders/types";

export function calculateUnrealizedPnl(
  side: PositionSide,
  quantity: number,
  averageEntryPrice: number,
  currentPrice: number,
): number {
  if (side === "LONG") {
    return (currentPrice - averageEntryPrice) * quantity;
  }

  return (averageEntryPrice - currentPrice) * quantity;
}

export function roundMoney(value: number): string {
  return value.toFixed(2);
}
