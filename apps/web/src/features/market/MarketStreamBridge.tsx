import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MarketPrice, CandleInterval, MarketCandles } from "./api";
import {
  getMarketStreamUrl,
  parseMarketFreshnessEvent,
  parseMarketPriceEvent,
  type MarketFreshnessEvent,
} from "./stream";
import { setLastKnownMarketQuote } from "./market-hours";
import { getFreshnessAfterStreamOpen } from "./marketStreamFreshnessLifecycle";

const MARKET_SYMBOL = "XAUUSD";

export const MARKET_PRICE_QUERY_KEY =
  ["market", MARKET_SYMBOL] as const;

const CANDLE_INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
};

function bucketTimeForQuote(quoteDate: Date, interval: CandleInterval): number {
  const bucketSec = CANDLE_INTERVAL_SECONDS[interval];
  const unixSec = Math.floor(quoteDate.getTime() / 1000);
  return Math.floor(unixSec / bucketSec) * bucketSec;
}

function applyTickToCandles(
  prev: MarketCandles,
  bucket: number,
  priceNum: number,
): MarketCandles["items"] | null {
  if (!prev?.items?.length) return null;

  const lastCandle = prev.items[prev.items.length - 1];
  const lastOpen = Number(lastCandle.open);
  const lastHigh = Number(lastCandle.high);
  const lastLow  = Number(lastCandle.low);

  if (bucket === lastCandle.time) {
    const newHigh = Math.max(lastHigh, priceNum);
    const newLow  = Math.min(lastLow, priceNum);
    const nextItems = prev.items.slice();
    nextItems[nextItems.length - 1] = {
      time: bucket,
      open: lastOpen,
      high: newHigh,
      low:  newLow,
      close: priceNum,
    } as MarketCandles["items"][number];
    return nextItems;
  }

  if (bucket > lastCandle.time) {
    const newCandle = {
      time: bucket,
      open: priceNum,
      high: priceNum,
      low: priceNum,
      close: priceNum,
    } as MarketCandles["items"][number];
    const sliceLen = Math.min(prev.items.length, 10_000);
    const nextItems = prev.items.slice(-sliceLen);
    nextItems.push(newCandle);
    return nextItems;
  }

  return null;
}

function tickLiveCandleIntoCache(
  queryClient: ReturnType<typeof useQueryClient>,
  quote: MarketPrice,
): void {
  const priceValue = Number(quote.last);
  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    return;
  }

  const quoteTimestampSource = quote.metadata?.sourceTimestamp || quote.timestamp;
  const quoteTime = quoteTimestampSource
    ? new Date(quoteTimestampSource)
    : new Date();

  if (!Number.isFinite(quoteTime.getTime())) {
    return;
  }

  const priceNum: number = priceValue;
  const intervalBuckets: Partial<Record<CandleInterval, number>> = {};
  const candlePrefix = ["market", "candles", MARKET_SYMBOL];

  const allQueries = queryClient.getQueryCache().getAll();
  const activeCandleQueries: Array<{
    key: unknown[];
    data: MarketCandles;
  }> = [];

  for (const query of allQueries) {
    const k = query.queryKey;
    if (!Array.isArray(k) || k.length < candlePrefix.length + 2) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < candlePrefix.length; i++) {
      if (k[i] !== candlePrefix[i]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const state = query.state as { data?: MarketCandles };
    const d = state.data;
    if (d?.items?.length) {
      activeCandleQueries.push({ key: k, data: d });
    }
  }

  const receivedAt = new Date().toISOString();
  const sourceTimestamp = quoteTimestampSource
    ? new Date(quoteTimestampSource).toISOString()
    : quoteTime.toISOString();
  const quoteSource =
    quote.source === "twelve-data" || quote.source === "demo"
      ? quote.source
      : undefined;

  for (const { key: queryKey, data: prev } of activeCandleQueries) {
    const iv = queryKey[3] as CandleInterval;
    if (!iv || !CANDLE_INTERVAL_SECONDS[iv]) continue;

    let bucket = intervalBuckets[iv];
    if (bucket === undefined) {
      bucket = bucketTimeForQuote(quoteTime, iv);
      intervalBuckets[iv] = bucket;
    }

    const nextItems = applyTickToCandles(prev, bucket, priceNum);
    if (!nextItems) continue;

    const latestCandleTime =
      nextItems.length > 0 ? nextItems[nextItems.length - 1].time : null;

    const nextSource =
      prev.source === "twelve-data" || prev.source === "demo"
        ? prev.source
        : quoteSource ?? prev.source;

    queryClient.setQueryData<MarketCandles>(queryKey, {
      symbol: prev.symbol,
      interval: prev.interval,
      source: nextSource === "twelve-data" || nextSource === "demo"
        ? nextSource
        : "twelve-data",
      items: nextItems,
      metadata: {
        receivedAt,
        sourceTimestamp,
        latestCandleTime,
      },
    });
  }
}

interface MarketStreamState {
  connected: boolean;
  freshness: MarketFreshnessEvent | null;
}

const MarketStreamContext =
  createContext<MarketStreamState>({
    connected: false,
    freshness: null,
  });

export function useMarketStreamStatus(): MarketStreamState {
  return useContext(MarketStreamContext);
}

export function MarketStreamBridge({
  children,
}: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [connected, setConnected] =
    useState(false);

  const [freshness, setFreshness] =
    useState<MarketFreshnessEvent | null>(null);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConnected(false);
      return;
    }

    const eventSource =
      new EventSource(
        getMarketStreamUrl(MARKET_SYMBOL),
      );

    function handleOpen(): void {
      setConnected(true);
      setFreshness(getFreshnessAfterStreamOpen);
    }

    function handleError(): void {
      /*
       * EventSource reconnects automatically.
       * While disconnected, React Query REST polling
       * becomes the fallback transport.
       */
      setConnected(false);
    }

    function handleQuote(
      event: MessageEvent<string>,
    ): void {
      try {
        const quote =
          parseMarketPriceEvent(
            event.data,
          );

        queryClient.setQueryData<MarketPrice>(
          MARKET_PRICE_QUERY_KEY,
          quote,
        );
        setLastKnownMarketQuote(quote);
        tickLiveCandleIntoCache(queryClient, quote);
      } catch (error) {
        /*
         * A malformed payload must not poison the
         * existing React Query cache. Transport health
         * is independent from payload validity.
         */
        console.error(
          "[market-stream] invalid quote event",
          error,
        );
      }
    }

    function handleFreshness(
      event: MessageEvent<string>,
    ): void {
      try {
        const nextFreshness =
          parseMarketFreshnessEvent(
            event.data,
          );

        setFreshness(nextFreshness);
      } catch (error) {
        /*
         * Payload validity and transport health are
         * independent. Keep the last valid freshness
         * state when one malformed event arrives.
         */
        console.error(
          "[market-stream] invalid freshness event",
          error,
        );
      }
    }

    eventSource.addEventListener(
      "open",
      handleOpen,
    );

    eventSource.addEventListener(
      "quote",
      handleQuote as EventListener,
    );

    eventSource.addEventListener(
      "freshness",
      handleFreshness as EventListener,
    );

    eventSource.addEventListener(
      "error",
      handleError,
    );

    return () => {
      eventSource.removeEventListener(
        "open",
        handleOpen,
      );

      eventSource.removeEventListener(
        "quote",
        handleQuote as EventListener,
      );

      eventSource.removeEventListener(
        "freshness",
        handleFreshness as EventListener,
      );

      eventSource.removeEventListener(
        "error",
        handleError,
      );

      eventSource.close();
    };
  }, [queryClient]);

  const value =
    useMemo(
      () => ({
        connected,
        freshness,
      }),
      [
        connected,
        freshness,
      ],
    );

  return (
    <MarketStreamContext.Provider value={value}>
      {children}
    </MarketStreamContext.Provider>
  );
}
