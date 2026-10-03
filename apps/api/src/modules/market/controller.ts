import type { Request, Response } from "express";

import {
  getCachedReferenceQuote,
  getMarketCandles,
  getReferenceQuote,
} from "./service.js";

import {
  serializeReferenceQuoteFreshnessSseEvent,
  serializeReferenceQuoteSseEvent,
} from "./reference-quote-sse.js";

import {
  getReferenceQuoteFreshness,
} from "./reference-quote-freshness.js";

import type { CandleInterval } from "./types.js";

const VALID_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

const DEFAULT_LIMIT = 50_000;
const MAX_LIMIT = 500_000;

const REFERENCE_QUOTE_STALE_AFTER_MS = 5_000;

export async function getPrice(req: Request, res: Response): Promise<void> {
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";

  const price = await getReferenceQuote(symbol);

  res.status(200).json({
    success: true,
    data: {
      symbol: price.symbol,
      bid: price.bid,
      ask: price.ask,
      last: price.last,
      source: price.source,

      /*
       * Transitional HTTP compatibility.
       * ReferenceQuote intentionally has no legacy timestamp.
       */
      timestamp: price.receivedAt,

      metadata: {
        receivedAt: price.receivedAt,
        sourceTimestamp: price.sourceTimestamp,
        bidAskType: price.bidAskType,
        executable:
          price.executionCapability !== "NONE",
      },
    },
  });
}

export function streamReferenceQuote(
  req: Request,
  res: Response,
): void {
  const symbol =
    typeof req.query.symbol === "string"
      ? req.query.symbol.trim().toUpperCase()
      : "XAUUSD";

  if (!symbol) {
    res.status(400).json({
      success: false,
      message: "Symbol không hợp lệ.",
      code: "INVALID_MARKET_SYMBOL",
    });

    return;
  }

  res.status(200);

  res.setHeader(
    "Content-Type",
    "text/event-stream; charset=utf-8",
  );

  res.setHeader(
    "Cache-Control",
    "no-cache, no-transform",
  );

  res.setHeader(
    "Connection",
    "keep-alive",
  );

  res.flushHeaders?.();

  let lastReceivedAt: string | null = null;

  let lastFreshnessStatus:
    | "FRESH"
    | "STALE"
    | "MISSING"
    | null = null;

  function observeReferenceQuote(): void {
    const quote =
      getCachedReferenceQuote(symbol);

    if (
      quote &&
      quote.receivedAt !== lastReceivedAt
    ) {
      lastReceivedAt = quote.receivedAt;

      res.write(
        serializeReferenceQuoteSseEvent(quote),
      );
    }

    const freshness =
      getReferenceQuoteFreshness(
        quote,
        Date.now(),
        {
          staleAfterMs:
            REFERENCE_QUOTE_STALE_AFTER_MS,
        },
      );

    if (
      freshness.status ===
      lastFreshnessStatus
    ) {
      return;
    }

    lastFreshnessStatus =
      freshness.status;

    res.write(
      serializeReferenceQuoteFreshnessSseEvent(
        symbol,
        freshness,
      ),
    );
  }

  /*
   * Send current quote when available and always
   * send the current freshness state immediately.
   *
   * Important:
   * this endpoint never requests the provider itself.
   */
  observeReferenceQuote();

  const quoteTimer =
    setInterval(
      observeReferenceQuote,
      250,
    );

  const heartbeatTimer =
    setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15_000);

  let closed = false;

  function cleanup(): void {
    if (closed) {
      return;
    }

    closed = true;

    clearInterval(quoteTimer);
    clearInterval(heartbeatTimer);
  }

  req.on("close", cleanup);
  req.on("aborted", cleanup);
}
export async function getCandles(req: Request, res: Response): Promise<void> {
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";

  const intervalParam =
    typeof req.query.interval === "string" ? req.query.interval : "1m";

  if (!VALID_INTERVALS.includes(intervalParam as CandleInterval)) {
    res.status(400).json({
      success: false,
      message: "Interval không hợp lệ. Hỗ trợ: 1m, 5m, 15m, 1h, 4h, 1d.",
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

  const receivedAt = new Date().toISOString();

  const latestCandleTime =
    candles.items.length > 0
      ? candles.items.reduce((latest, candle) => Math.max(latest, candle.time), candles.items[0].time)
      : null;

  const numericItems = candles.items.map((candle) => ({
    time: candle.time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  }));

  res.status(200).json({
    success: true,
    data: {
      symbol: candles.symbol,
      interval: candles.interval,
      source: candles.source,
      items: numericItems,
      metadata: {
        receivedAt,
        sourceTimestamp: null,
        latestCandleTime,
      },
    },
  });
}
