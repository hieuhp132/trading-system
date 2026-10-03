import type {
  CandlestickData,
  UTCTimestamp,
} from "lightweight-charts";

import type {
  CandleInterval,
  MarketCandles,
} from "./api";

import { normalizeCandles, normalizeLastCandle } from "./normalizeCandles";

type CandleData = CandlestickData<UTCTimestamp>;

export interface CandleSeriesTarget {
  setData(data: CandleData[]): void;
  update?(data: CandleData): void;
  getData?(): CandleData[];
}

export interface CandleTimeScaleTarget {
  fitContent(): void;
}

export interface CandleChartTarget {
  timeScale(): CandleTimeScaleTarget;
}

export interface SyncCandlesInput {
  series: CandleSeriesTarget;
  chart: CandleChartTarget | null;
  data: MarketCandles | undefined;
  interval: CandleInterval;
  shouldClearChart: boolean;
  fittedInterval: string | null;
  lastAppliedLatestTime?: number | null;
  skipFitContent?: boolean;
}

export interface SyncCandlesResult {
  fittedInterval: string | null;
  action: "clear" | "update";
  latestTimestamp: number | null;
}

function getLatestTimestamp(data: MarketCandles | undefined): number | null {
  if (!data?.items?.length) {
    return null;
  }
  let latest = data.items[0].time;
  for (let i = 1; i < data.items.length; i++) {
    const t = data.items[i].time;
    if (t > latest) latest = t;
  }
  return latest;
}

export function syncCandlesToChart({
  series,
  chart: _chart,
  data,
  interval,
  shouldClearChart,
  fittedInterval,
  lastAppliedLatestTime,
  skipFitContent: _skipFitContent = true,
}: SyncCandlesInput): SyncCandlesResult {
  const matchesInterval =
    data?.symbol === "XAUUSD" &&
    data.interval === interval;

  if (!matchesInterval) {
    return {
      fittedInterval,
      action: "update",
      latestTimestamp: lastAppliedLatestTime ?? null,
    };
  }

  if (shouldClearChart) {
    const currentSeriesData = series.getData?.() ?? [];
    if (currentSeriesData.length > 0) {
      return {
        fittedInterval,
        action: "update",
        latestTimestamp: lastAppliedLatestTime ?? null,
      };
    }

    series.setData([]);

    return {
      fittedInterval: null,
      action: "clear",
      latestTimestamp: null,
    };
  }

  const latestTimestamp = getLatestTimestamp(data);
  const appliedTime = lastAppliedLatestTime ?? null;

  if (
    latestTimestamp !== null &&
    appliedTime !== null &&
    latestTimestamp < appliedTime
  ) {
    return {
      fittedInterval,
      action: "update",
      latestTimestamp: appliedTime,
    };
  }

  const existing = series.getData?.() ?? [];
  const rawItems = data.items;
  const hasUpdate = typeof series.update === "function";
  const canUpdateIncrementally =
    hasUpdate &&
    existing.length > 0 &&
    (existing.length === rawItems.length ||
      existing.length === rawItems.length - 1);

  if (canUpdateIncrementally) {
    const lastCandle = normalizeLastCandle(rawItems);
    if (!lastCandle) {
      const candles = normalizeCandles(rawItems);
      series.setData(candles);
    } else {
      if (existing.length === rawItems.length - 1) {
        series.update!(lastCandle);
      } else {
        const existingLast = existing[existing.length - 1];
        if (
          existingLast.time === lastCandle.time &&
          (existingLast.open !== lastCandle.open ||
            existingLast.high !== lastCandle.high ||
            existingLast.low !== lastCandle.low ||
            existingLast.close !== lastCandle.close)
        ) {
          series.update!(lastCandle);
        }
      }
    }
  } else {
    const candles = normalizeCandles(rawItems);
    series.setData(candles);
  }

  return {
    fittedInterval: interval,
    action: "update",
    latestTimestamp,
  };
}