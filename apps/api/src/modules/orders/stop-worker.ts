import { db } from "../../database/prisma.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import { getTradingQuote } from "../market/service.js";
import {
  isMarketClosedByWeekend,
  isMarketClosedError,
} from "../market/market-hours.js";
import type { MarketPriceResponse } from "../market/types.js";
import { evaluateStopTrigger } from "./stop-trigger.js";
import { executeTriggeredStop } from "./service.js";

export interface StopWorkerPosition {
  id: string;
  accountId: string;
  side: "LONG" | "SHORT";
  stopLoss: string | null;
  takeProfit: string | null;
}

export interface StopWorkerDependencies {
  listPositions(): Promise<StopWorkerPosition[]>;
  getQuote(): Promise<MarketPriceResponse>;
  getUserId(accountId: string): Promise<string | null>;
  execute(
    userId: string,
    positionId: string,
    quote: MarketPriceResponse,
  ): Promise<unknown>;
  logError(error: unknown, context: string): void;
}

export const defaultStopWorkerDependencies: StopWorkerDependencies = {
  async listPositions() {
    const positions = await db.orm.public.Position.where({
      status: "OPEN",
    }).all();
    return positions
      .filter(
        (position) => position.stopLoss != null || position.takeProfit != null,
      )
      .map((position) => ({
        id: position.id,
        accountId: position.accountId,
        side: position.side,
        stopLoss: position.stopLoss == null ? null : String(position.stopLoss),
        takeProfit:
          position.takeProfit == null ? null : String(position.takeProfit),
      }));
  },
  getQuote: () => getTradingQuote(XAUUSD_SPEC.symbol),
  async getUserId(accountId) {
    const account = await db.orm.public.DemoAccount.where({
      id: accountId,
    }).first();
    return account?.userId ?? null;
  },
  execute: executeTriggeredStop,
  logError(error, context) {
    if (isMarketClosedError(error)) {
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "TRADING_QUOTE_STALE"
    ) {
      return;
    }

    console.error(`[stop-worker] ${context}`, error);
  },
};

const STALE_MARKET_CLOSED_LOG_WINDOW_MS = 60_000;
let lastStaleMarketClosedLogAt = 0;

export function validateWorkerQuote(
  quote: MarketPriceResponse,
  maxAgeMs: number,
  now = Date.now(),
): void {
  if (quote.symbol !== XAUUSD_SPEC.symbol) {
    throw new Error("Stop worker: invalid quote symbol");
  }
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new Error("Stop worker: invalid BID/ASK");
  }
  const quoteWithMaybeReceivedAt = quote as MarketPriceResponse & {
    receivedAt?: string;
  };
  const freshnessRaw = quoteWithMaybeReceivedAt.receivedAt ?? quote.timestamp;
  const freshnessTs = Date.parse(freshnessRaw);
  if (
    !Number.isFinite(freshnessTs) ||
    freshnessTs > now + 1000
  ) {
    throw new Error("Stop worker: stale or invalid quote timestamp");
  }

  const ageMs = now - freshnessTs;
  const marketClosed = isMarketClosedByWeekend();

  if (marketClosed) {
    if (ageMs > maxAgeMs) {
      if (
        now - lastStaleMarketClosedLogAt >=
        STALE_MARKET_CLOSED_LOG_WINDOW_MS
      ) {
        lastStaleMarketClosedLogAt = now;
        console.info(
          `[worker-quote] market closed weekend; tolerating stale quote age=${Math.round(ageMs / 1000)}s`,
        );
      }
    }
    return;
  }

  if (ageMs > maxAgeMs) {
    throw new Error(
      `Stop worker: stale or invalid quote timestamp (age=${Math.round(ageMs / 1000)}s; max=${Math.round(maxAgeMs / 1000)}s)`,
    );
  }
}

export function createStopWorker(
  dependencies: StopWorkerDependencies = defaultStopWorkerDependencies,
  options: { intervalMs?: number; maxQuoteAgeMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 1000;
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? 60_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 100) {
    throw new Error("STOP_WORKER_INTERVAL_MS must be an integer >= 100");
  }
  if (!Number.isInteger(maxQuoteAgeMs) || maxQuoteAgeMs < 100) {
    throw new Error("STOP_WORKER_MAX_QUOTE_AGE_MS must be an integer >= 100");
  }

  let running = false;
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: Promise<void> | null = null;

  let lastStaleTickLogAt = 0;

  async function tick(): Promise<void> {
    if (stopping || running) return;
    running = true;
    try {
      const positions = await dependencies.listPositions();
      if (positions.length === 0 || stopping) return;
      let quote: MarketPriceResponse;

      try {
        quote = await dependencies.getQuote();
        validateWorkerQuote(quote, maxQuoteAgeMs);
      } catch (err) {
        const now = Date.now();
        if (now - lastStaleTickLogAt >= 30_000) {
          lastStaleTickLogAt = now;
          dependencies.logError(
            err,
            "tick: skipping positions due to stale/invalid quote",
          );
        }
        return;
      }

      for (const position of positions) {
        if (stopping) break;
        try {
          /*
           * Refresh shared quote when it has aged past half
           * the allowed window. Keeps SL/TP trigger evaluation
           * and execution prices fresh across long loops.
           */
          const refreshThreshold = maxQuoteAgeMs >> 1;
          const quoteAny = quote as MarketPriceResponse & {
            receivedAt?: string;
          };
          const tsRaw = quoteAny.receivedAt ?? quote.timestamp;
          const ts = Date.parse(tsRaw);
          const currentNow = Date.now();
          if (
            !Number.isFinite(ts) ||
            currentNow - ts > refreshThreshold
          ) {
            const refreshed =
              await dependencies.getQuote();
            validateWorkerQuote(
              refreshed,
              maxQuoteAgeMs,
              currentNow,
            );
            quote = refreshed;
          }

          const trigger = evaluateStopTrigger(position, quote);
          if (!trigger.triggered) continue;
          const userId = await dependencies.getUserId(position.accountId);
          if (!userId)
            throw new Error(`Account not found: ${position.accountId}`);
          validateWorkerQuote(quote, maxQuoteAgeMs);
          await dependencies.execute(userId, position.id, quote);
        } catch (error) {
          dependencies.logError(error, `position=${position.id}`);
        }
      }
    } catch (error) {
      dependencies.logError(error, "tick");
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (stopping) return;
    timer = setTimeout(() => {
      active = tick().finally(() => {
        active = null;
        schedule();
      });
    }, intervalMs);
  }

  return {
    start() {
      if (stopping || timer || active) return;
      schedule();
    },
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      timer = null;
      await active;
    },
    tick,
  };
}
