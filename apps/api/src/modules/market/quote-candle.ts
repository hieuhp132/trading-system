import type { MarketCandle } from "./types.js";

export function applyQuoteToCandle(
  previous: MarketCandle | null,
  bucketTime: number,
  price: number,
): MarketCandle {
  if (
    !Number.isSafeInteger(bucketTime) ||
    bucketTime < 0 ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error("Invalid quote candle input");
  }

  if (!previous) {
    const value = price.toFixed(2);
    return {
      time: bucketTime,
      open: value,
      high: value,
      low: value,
      close: value,
    };
  }

  if (previous.time !== bucketTime) {
    throw new Error("Quote candle bucket does not match previous candle");
  }

  return {
    time: bucketTime,
    open: String(previous.open),
    high: Math.max(Number(previous.high), price).toFixed(2),
    low: Math.min(Number(previous.low), price).toFixed(2),
    close: price.toFixed(2),
  };
}