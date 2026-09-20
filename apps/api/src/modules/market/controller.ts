import type { Request, Response } from "express";

import { getMarketCandles, getMarketPrice } from "./service.js";

import type { CandleInterval } from "./types.js";

const VALID_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function getPrice(req: Request, res: Response): Promise<void> {
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";

  const price = await getMarketPrice(symbol);

  res.status(200).json({
    success: true,
    data: price,
  });
}

export async function getCandles(req: Request, res: Response): Promise<void> {
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";

  const intervalParam =
    typeof req.query.interval === "string" ? req.query.interval : "1m";

  if (!VALID_INTERVALS.includes(intervalParam as CandleInterval)) {
    res.status(400).json({
      success: false,
      message: "Interval không hợp lệ. Hỗ trợ: 1m, 5m, 15m, 1h.",
      code: "INVALID_CANDLE_INTERVAL",
    });

    return;
  }

  const parsedLimit =
    typeof req.query.limit === "string"
      ? Number(req.query.limit)
      : DEFAULT_LIMIT;

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIMIT
  ) {
    res.status(400).json({
      success: false,
      message: `Limit phải là số nguyên từ 1 đến ${MAX_LIMIT}.`,
      code: "INVALID_CANDLE_LIMIT",
    });

    return;
  }

  const candles = await getMarketCandles(
    symbol,
    intervalParam as CandleInterval,
    parsedLimit,
  );

  res.status(200).json({
    success: true,
    data: candles,
  });
}
