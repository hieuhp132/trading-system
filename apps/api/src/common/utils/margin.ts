import { XAUUSD_SPEC } from "../constants/xauusd.js";

export function calculateRequiredMargin(
  quantity: number,
  price: number,
  leverage: number,
): number {
  if (!Number.isFinite(leverage) || leverage <= 0) {
    throw new Error("leverage must be finite and > 0");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity must be finite and > 0");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price must be finite and > 0");
  }

  return (
    quantity *
    XAUUSD_SPEC.contractSize *
    price
  ) / leverage;
}

export function calculateUsedMargin(
  positions: ReadonlyArray<{
    quantity: number;
    entryPrice: number;
  }>,
  leverage: number,
): number {
  return positions.reduce(
    (total, position) =>
      total +
      calculateRequiredMargin(
        position.quantity,
        position.entryPrice,
        leverage,
      ),
    0,
  );
}
