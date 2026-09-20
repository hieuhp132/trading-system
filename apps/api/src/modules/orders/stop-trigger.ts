import type { MarketPriceResponse } from "../market/types.js";

export type StopTriggerReason = "STOP_LOSS" | "TAKE_PROFIT";

export interface StopTriggerPosition {
  side: "LONG" | "SHORT";
  stopLoss: string | null;
  takeProfit: string | null;
}

export interface StopTriggerResult {
  triggered: boolean;
  reason: StopTriggerReason | null;
  executionPrice: string | null;
}

function parsePositivePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const price = Number(value);

  return Number.isFinite(price) && price > 0 ? price : null;
}

export function evaluateStopTrigger(
  position: StopTriggerPosition,
  quote: MarketPriceResponse,
): StopTriggerResult {
  const bid = parsePositivePrice(quote.bid);
  const ask = parsePositivePrice(quote.ask);

  if (bid === null || ask === null || bid > ask) {
    throw new Error("Invalid market quote");
  }

  const stopLoss = parsePositivePrice(position.stopLoss);
  const takeProfit = parsePositivePrice(position.takeProfit);

  if (
    (position.stopLoss != null && stopLoss === null) ||
    (position.takeProfit != null && takeProfit === null)
  ) {
    throw new Error("Invalid position stop levels");
  }

  const isLong = position.side === "LONG";

  // LONG đóng bằng SELL tại BID.
  // SHORT đóng bằng BUY tại ASK.
  const executionPrice = isLong ? bid : ask;

  const hitStopLoss =
    stopLoss !== null &&
    (isLong ? executionPrice <= stopLoss : executionPrice >= stopLoss);

  const hitTakeProfit =
    takeProfit !== null &&
    (isLong ? executionPrice >= takeProfit : executionPrice <= takeProfit);

  // Ưu tiên SL nếu dữ liệu bất thường khiến cả hai cùng kích hoạt.
  if (hitStopLoss) {
    return {
      triggered: true,
      reason: "STOP_LOSS",
      executionPrice: executionPrice.toFixed(2),
    };
  }

  if (hitTakeProfit) {
    return {
      triggered: true,
      reason: "TAKE_PROFIT",
      executionPrice: executionPrice.toFixed(2),
    };
  }

  return {
    triggered: false,
    reason: null,
    executionPrice: null,
  };
}
