import type { CandleInterval } from "./types.js";

export const MAX_MARKET_CANDLE_LIMIT = 500_000;

const ENV_NAMES: Record<CandleInterval, string> = {
  "1m": "MARKET_CANDLES_LIMIT_1M",
  "5m": "MARKET_CANDLES_LIMIT_5M",
  "15m": "MARKET_CANDLES_LIMIT_15M",
  "1h": "MARKET_CANDLES_LIMIT_1H",
  "4h": "MARKET_CANDLES_LIMIT_4H",
  "1d": "MARKET_CANDLES_LIMIT_1D",
};

const DEFAULT_LIMITS: Record<CandleInterval, number> = {
  "1m": 5_000,
  "5m": 5_000,
  "15m": 5_000,
  "1h": 5_000,
  "4h": 2_000,
  "1d": 1_000,
};

export function resolveMarketCandleLimit(
  interval: CandleInterval,
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const raw = environment[ENV_NAMES[interval]]?.trim();
  if (!raw) return DEFAULT_LIMITS[interval];

  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_MARKET_CANDLE_LIMIT
  ) {
    throw new Error(
      `${ENV_NAMES[interval]} must be an integer between 1 and ${MAX_MARKET_CANDLE_LIMIT}`,
    );
  }

  return value;
}