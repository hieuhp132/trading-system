import type { MarketCandles, MarketPrice } from "./api";

export function getLastKnownMarketQuote(): MarketPrice | null {
  return null;
}

export function setLastKnownMarketQuote(_quote: MarketPrice): void {
  return;
}

export function getLastKnownMarketCandles(
  _symbol = "XAUUSD",
  _interval = "1m",
): MarketCandles | null {
  return null;
}

export function setLastKnownMarketCandles(_candles: MarketCandles): void {
  return;
}

export function isMarketClosedByWeekend(now = new Date()): boolean {
  const date = new Date(now);
  const day = date.getDay();
  const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();

  if (day === 0) {
    return true;
  }

  if (day === 6) {
    return true;
  }

  if (day === 1 && minutesFromMidnight < 5 * 60) {
    return true;
  }

  return false;
}

export function isMarketClosedApiError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    response?: {
      data?: {
        error?: {
          code?: string;
        };
      };
    };
  };

  return (
    candidate.code === "MARKET_CLOSED" ||
    candidate.response?.data?.error?.code === "MARKET_CLOSED"
  );
}

export function shouldPauseMarketPolling(now = new Date()): boolean {
  return isMarketClosedByWeekend(now);
}

export function markMarketClosedConfirmed(): void {
  return;
}

export function clearMarketClosedConfirmed(): void {
  return;
}
