import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MarketPrice } from "./api";
import {
  getMarketStreamUrl,
  parseMarketFreshnessEvent,
  parseMarketPriceEvent,
  type MarketFreshnessEvent,
} from "./stream";

const MARKET_SYMBOL = "XAUUSD";

export const MARKET_PRICE_QUERY_KEY =
  ["market", MARKET_SYMBOL] as const;

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
