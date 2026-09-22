import type {
  CandlestickData,
  UTCTimestamp,
} from "lightweight-charts";

import type {
  CandleInterval,
  MarketCandles,
} from "./api";

import { normalizeCandles } from "./normalizeCandles";

type CandleData = CandlestickData<UTCTimestamp>;

export interface CandleSeriesTarget {
  setData(data: CandleData[]): void;
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
}

export interface SyncCandlesResult {
  fittedInterval: string | null;
  action: "clear" | "update";
}

export function syncCandlesToChart({
  series,
  chart,
  data,
  interval,
  shouldClearChart,
  fittedInterval,
}: SyncCandlesInput): SyncCandlesResult {
  const matchesInterval =
    data?.symbol === "XAUUSD" &&
    data.interval === interval;

  if (!matchesInterval || shouldClearChart) {
    series.setData([]);

    return {
      fittedInterval: null,
      action: "clear",
    };
  }

  const candles = normalizeCandles(data.items);

  series.setData(candles);

  if (
    candles.length > 0 &&
    fittedInterval !== interval &&
    chart
  ) {
    chart.timeScale().fitContent();

    return {
      fittedInterval: interval,
      action: "update",
    };
  }

  return {
    fittedInterval,
    action: "update",
  };
}