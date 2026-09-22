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
}

export interface CandleDisplayState {
  status: CandleDisplayStatus;
  validCandleCount: number;
  shouldClearChart: boolean;
  shouldShowStaleWarning: boolean;
}

export function getCandleDisplayState({
  data,
  isLoading,
  isError,
}: CandleDisplayInput): CandleDisplayState {
  const validCandleCount = data
    ? normalizeCandles(data.items).length
    : 0;

  if (isError) {
    const hasValidCachedData = validCandleCount > 0;

    return {
      status: hasValidCachedData ? "stale" : "error",
      validCandleCount,
      shouldClearChart: !hasValidCachedData,
      shouldShowStaleWarning: hasValidCachedData,
    };
  }

  if (isLoading && !data) {
    return {
      status: "loading",
      validCandleCount: 0,
      shouldClearChart: true,
      shouldShowStaleWarning: false,
    };
  }

  if (validCandleCount === 0) {
    return {
      status: "empty",
      validCandleCount: 0,
      shouldClearChart: true,
      shouldShowStaleWarning: false,
    };
  }

  return {
    status: "ready",
    validCandleCount,
    shouldClearChart: false,
    shouldShowStaleWarning: false,
  };
}