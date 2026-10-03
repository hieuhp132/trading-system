import type {
  CandleInterval,
  MarketCandlesResponse,
} from "./types.js";

export const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
};

export function aggregateCandlesToInterval(
  candles: MarketCandlesResponse,
  interval: CandleInterval,
): MarketCandlesResponse {
  const bucketSeconds = CANDLE_INTERVAL_SECONDS[interval];
  const buckets = new Map<number, MarketCandlesResponse["items"]>();

  for (const candle of candles.items) {
    const bucketTime = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const bucket = buckets.get(bucketTime) ?? [];
    bucket.push(candle);
    buckets.set(bucketTime, bucket);
  }

  const items = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time, bucket]) => {
      const high = bucket.reduce((acc, candle) => {
        const value = Number(candle.high);
        return Number.isFinite(value) ? Math.max(acc, value) : acc;
      }, Number.NEGATIVE_INFINITY);
      const low = bucket.reduce((acc, candle) => {
        const value = Number(candle.low);
        return Number.isFinite(value) ? Math.min(acc, value) : acc;
      }, Number.POSITIVE_INFINITY);

      return {
        time,
        open: bucket[0].open,
        high: high.toFixed(2),
        low: low.toFixed(2),
        close: bucket[bucket.length - 1].close,
      };
    });

  return {
    symbol: candles.symbol,
    interval,
    source: candles.source,
    items,
  };
}