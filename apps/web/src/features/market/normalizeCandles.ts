import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

import type { MarketCandle } from "./api";

export function normalizeCandles(
  items: MarketCandle[],
): CandlestickData<UTCTimestamp>[] {
  const unique = new Map<number, CandlestickData<UTCTimestamp>>();

  for (const candle of items) {
    const time = candle.time;
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (!Number.isSafeInteger(time) || time <= 0) {
      continue;
    }

    if (
      ![open, high, low, close].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      continue;
    }

    if (
      high < Math.max(open, close, low) ||
      low > Math.min(open, close, high)
    ) {
      continue;
    }

    unique.set(time, {
      time: time as UTCTimestamp,
      open,
      high,
      low,
      close,
    });
  }

  return [...unique.values()].sort((a, b) => a.time - b.time);
}