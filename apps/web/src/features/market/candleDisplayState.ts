import type { MarketCandles } from "./api";
import { normalizeCandles } from "./normalizeCandles";

export type CandleDisplayStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "stale";

export interface CandleDisplayInput {
  data: MarketCandles | undefined;
  isLoading: boolean;
  isError: boolean;
  marketClosed?: boolean;
}

export interface CandleDisplayState {
  status: CandleDisplayStatus;
  validCandleCount: number;
  shouldClearChart: boolean;
  shouldShowStaleWarning: boolean;
  isMarketClosed: boolean;
}

export function getCandleDisplayState({
  data,
  isLoading,
  isError,
  marketClosed = false,
}: CandleDisplayInput): CandleDisplayState {
  const validCandleCount = data
    ? normalizeCandles(data.items).length
    : 0;

  if (marketClosed) {
    return {
      status: "ready",
      validCandleCount,
      shouldClearChart: false,
      shouldShowStaleWarning: false,
      isMarketClosed: true,
    };
  }

  if (isError) {
    const hasValidCachedData = validCandleCount > 0;

    return {
      status: hasValidCachedData ? "ready" : "error",
      validCandleCount,
      shouldClearChart: false,
      shouldShowStaleWarning: false,
      isMarketClosed: false,
    };
  }

  if (isLoading && !data) {
    return {
      status: "loading",
      validCandleCount: 0,
      shouldClearChart: true,
      shouldShowStaleWarning: false,
      isMarketClosed: false,
    };
  }

  if (isLoading && data && validCandleCount > 0) {
    return {
      status: "ready",
      validCandleCount,
      shouldClearChart: false,
      shouldShowStaleWarning: false,
      isMarketClosed: false,
    };
  }

  if (validCandleCount === 0) {
    return {
      status: "empty",
      validCandleCount: 0,
      shouldClearChart: true,
      shouldShowStaleWarning: false,
      isMarketClosed: false,
    };
  }

  return {
    status: "ready",
    validCandleCount,
    shouldClearChart: false,
    shouldShowStaleWarning: false,
    isMarketClosed: false,
  };
}