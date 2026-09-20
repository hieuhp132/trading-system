import type { PositionSide } from "../../modules/orders/types.js";
import { XAUUSD_SPEC } from "../constants/xauusd.js";

export function calculateUnrealizedPnl(
  side: PositionSide,
  quantity: number,
  averageEntryPrice: number,
  currentPrice: number,
): number {
  const priceDifference =
    side === "LONG"
      ? currentPrice - averageEntryPrice
      : averageEntryPrice - currentPrice;

  return priceDifference * quantity * XAUUSD_SPEC.contractSize;
}

export function roundMoney(value: number): string {
  return value.toFixed(2);
}
