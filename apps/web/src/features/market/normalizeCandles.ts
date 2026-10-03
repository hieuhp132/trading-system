import type { CandlestickData, UTCTimestamp } from "lightweight-charts";

import type { MarketCandle } from "./api";

interface NormalizeCacheEntry {
  inputLength: number;
  inputLastTime: number;
  inputLastClose: number;
  result: CandlestickData<UTCTimestamp>[];
}

const normalizeCache = new WeakMap<
  MarketCandle[],
  NormalizeCacheEntry
>();

function validateCandle(candle: MarketCandle): CandlestickData<UTCTimestamp> | null {
  const time = candle.time;
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);

  if (!Number.isSafeInteger(time) || time <= 0) {
    return null;
  }

  if (
    ![open, high, low, close].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }

  if (
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    return null;
  }

  return {
    time: time as UTCTimestamp,
    open,
    high,
    low,
    close,
  };
}

export function normalizeCandles(
  items: MarketCandle[],
): CandlestickData<UTCTimestamp>[] {
  const lastRaw = items[items.length - 1];
  if (lastRaw) {
    const cached = normalizeCache.get(items);
    const lastTime = Number(lastRaw.time);
    const lastClose = Number(lastRaw.close);
    if (
      cached &&
      cached.inputLength === items.length &&
      cached.inputLastTime === lastTime &&
      cached.inputLastClose === lastClose
    ) {
      return cached.result;
    }
  }

  const unique = new Map<number, CandlestickData<UTCTimestamp>>();

  for (const candle of items) {
    const normalized = validateCandle(candle);
    if (normalized) {
      unique.set(normalized.time, normalized);
    }
  }

  const result = [...unique.values()].sort((a, b) => a.time - b.time);

  if (lastRaw) {
    normalizeCache.set(items, {
      inputLength: items.length,
      inputLastTime: Number(lastRaw.time),
      inputLastClose: Number(lastRaw.close),
      result,
    });
  }

  return result;
}

export function normalizeLastCandle(
  items: MarketCandle[],
): CandlestickData<UTCTimestamp> | null {
  if (items.length === 0) return null;
  return validateCandle(items[items.length - 1]);
}

export { validateCandle };