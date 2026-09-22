import type { CandleInterval } from "./api";

export type CandleFreshnessStatus =
  | "CURRENT_BUCKET"
  | "DELAYED_BUCKET"
  | "FUTURE_BUCKET"
  | "UNKNOWN";

export interface CandleFreshnessInput {
  interval: CandleInterval;
  latestCandleTime: number | null | undefined;
  sourceTimestamp: string | null | undefined;
  nowMs: number;
}

export interface CandleFreshnessResult {
  status: CandleFreshnessStatus;
  marketFreshness: "UNVERIFIED";
  intervalSeconds: number;
  lagSeconds: number | null;
}

const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
};

export function getCandleFreshness({
  interval,
  latestCandleTime,
  nowMs,
}: CandleFreshnessInput): CandleFreshnessResult {
  const intervalSeconds = INTERVAL_SECONDS[interval];

  const unknown: CandleFreshnessResult = {
    status: "UNKNOWN",
    marketFreshness: "UNVERIFIED",
    intervalSeconds,
    lagSeconds: null,
  };

  if (
    !Number.isFinite(nowMs) ||
    latestCandleTime === null ||
    latestCandleTime === undefined ||
    !Number.isFinite(latestCandleTime) ||
    latestCandleTime < 0
  ) {
    return unknown;
  }

  const nowSeconds = Math.floor(nowMs / 1000);

  const currentBucket =
    Math.floor(nowSeconds / intervalSeconds) * intervalSeconds;

  const candleBucket =
    Math.floor(latestCandleTime / intervalSeconds) * intervalSeconds;

  const lagSeconds = nowSeconds - latestCandleTime;

  if (candleBucket > currentBucket) {
    return {
      status: "FUTURE_BUCKET",
      marketFreshness: "UNVERIFIED",
      intervalSeconds,
      lagSeconds,
    };
  }

  if (candleBucket < currentBucket) {
    return {
      status: "DELAYED_BUCKET",
      marketFreshness: "UNVERIFIED",
      intervalSeconds,
      lagSeconds,
    };
  }

  return {
    status: "CURRENT_BUCKET",
    marketFreshness: "UNVERIFIED",
    intervalSeconds,
    lagSeconds,
  };
}
