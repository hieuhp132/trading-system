import { db } from "../../database/prisma.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import { getMarketPrice } from "../market/service.js";
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
  execute(userId: string, positionId: string, quote: MarketPriceResponse): Promise<unknown>;
  logError(error: unknown, context: string): void;
}

export const defaultStopWorkerDependencies: StopWorkerDependencies = {
  async listPositions() {
    const positions = await db.orm.public.Position.where({ status: "OPEN" }).all();
    return positions
      .filter((position) => position.stopLoss != null || position.takeProfit != null)
      .map((position) => ({
        id: position.id,
        accountId: position.accountId,
        side: position.side,
        stopLoss: position.stopLoss == null ? null : String(position.stopLoss),
        takeProfit: position.takeProfit == null ? null : String(position.takeProfit),
      }));
  },
  getQuote: () => getMarketPrice(XAUUSD_SPEC.symbol),
  async getUserId(accountId) {
    const account = await db.orm.public.DemoAccount.where({ id: accountId }).first();
    return account?.userId ?? null;
  },
  execute: executeTriggeredStop,
  logError(error, context) {
    console.error(`[stop-worker] ${context}`, error);
  },
};

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
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || bid > ask) {
    throw new Error("Stop worker: invalid BID/ASK");
  }
  const timestamp = Date.parse(quote.timestamp);
  if (!Number.isFinite(timestamp) || timestamp > now + 1000 || now - timestamp > maxAgeMs) {
    throw new Error("Stop worker: stale or invalid quote timestamp");
  }
}

export function createStopWorker(
  dependencies: StopWorkerDependencies = defaultStopWorkerDependencies,
  options: { intervalMs?: number; maxQuoteAgeMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 1000;
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? 5000;
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

  async function tick(): Promise<void> {
    if (stopping || running) return;
    running = true;
    try {
      const positions = await dependencies.listPositions();
      if (positions.length === 0 || stopping) return;
      const quote = await dependencies.getQuote();
      validateWorkerQuote(quote, maxQuoteAgeMs);

      for (const position of positions) {
        if (stopping) break;
        try {
          const trigger = evaluateStopTrigger(position, quote);
          if (!trigger.triggered) continue;
          const userId = await dependencies.getUserId(position.accountId);
          if (!userId) throw new Error(`Account not found: ${position.accountId}`);
          // Recheck quote freshness if earlier positions took time to execute.
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
