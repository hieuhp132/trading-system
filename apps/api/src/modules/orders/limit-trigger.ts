import type { MarketPriceResponse } from "../market/types.js";

export interface PendingLimitOrder {
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  requestedPrice: string;
}

export interface LimitTriggerResult {
  triggered: boolean;
  executionPrice: string | null;
}

export function evaluateLimitTrigger(
  order: PendingLimitOrder,
  quote: MarketPriceResponse,
): LimitTriggerResult {
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const limitPrice = Number(order.requestedPrice);

  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new Error("Invalid market quote");
  }

  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    throw new Error("Invalid limit price");
  }

  const executionPrice = order.orderType === "BUY_LIMIT" ? ask : bid;

  const triggered =
    order.orderType === "BUY_LIMIT" ? ask <= limitPrice : bid >= limitPrice;

  return {
    triggered,
    executionPrice: triggered ? executionPrice.toFixed(2) : null,
  };
}
