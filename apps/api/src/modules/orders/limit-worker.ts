import { db } from "../../database/prisma.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import { getTradingQuote } from "../market/service.js";

import type { MarketPriceResponse } from "../market/types.js";

import { evaluateLimitTrigger } from "./limit-trigger.js";
import { executePendingLimitOrder } from "./service.js";
import { validateWorkerQuote } from "./stop-worker.js";
import { classifyLimitError } from "./limit-error-policy.js";

export interface LimitWorkerOrder {
  id: string;
  accountId: string;
  orderType: "BUY_LIMIT" | "SELL_LIMIT";
  requestedPrice: string;
}

export interface LimitWorkerDependencies {
  listOrders(): Promise<LimitWorkerOrder[]>;

  getQuote(): Promise<MarketPriceResponse>;

  getUserId(accountId: string): Promise<string | null>;

  execute(
    userId: string,
    orderId: string,
    quote: MarketPriceResponse,
  ): Promise<unknown>;

  logError(error: unknown, context: string): void;
}

export const defaultLimitWorkerDependencies: LimitWorkerDependencies = {
  async listOrders() {
    const orders = await db.orm.public.Order.where({
      status: "PENDING",
      symbol: XAUUSD_SPEC.symbol,
    }).all();

    return orders
      .filter(
        (order) =>
          (order.orderType === "BUY_LIMIT" ||
            order.orderType === "SELL_LIMIT") &&
          order.requestedPrice != null,
      )
      .map((order) => ({
        id: order.id,
        accountId: order.accountId,
        orderType: order.orderType as "BUY_LIMIT" | "SELL_LIMIT",
        requestedPrice: String(order.requestedPrice),
      }));
  },

  getQuote: () => getTradingQuote(XAUUSD_SPEC.symbol),

  async getUserId(accountId) {
    const account = await db.orm.public.DemoAccount.where({
      id: accountId,
    }).first();

    return account?.userId ?? null;
  },

  execute: executePendingLimitOrder,

  logError(error, context) {
    console.error(`[limit-worker] ${context}`, error);
  },
};

export function createLimitWorker(
  dependencies: LimitWorkerDependencies = defaultLimitWorkerDependencies,
  options: {
    intervalMs?: number;
    maxQuoteAgeMs?: number;
    now?: () => number;
  } = {},
) {
  const intervalMs = options.intervalMs ?? 1000;
  const maxQuoteAgeMs = options.maxQuoteAgeMs ?? 5000;
  const now = options.now ?? Date.now;
  if (!Number.isInteger(intervalMs) || intervalMs < 100) {
    throw new Error("LIMIT_WORKER_INTERVAL_MS must be an integer >= 100");
  }

  if (!Number.isInteger(maxQuoteAgeMs) || maxQuoteAgeMs < 100) {
    throw new Error("LIMIT_WORKER_MAX_QUOTE_AGE_MS must be an integer >= 100");
  }

  let running = false;
  let stopping = false;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: Promise<void> | null = null;

  // Cooldown is local to this worker instance.
  // It does not change the Order status in PostgreSQL.
  const retryAfter = new Map<string, number>();

  async function tick(): Promise<void> {
    if (stopping || running) {
      return;
    }

    running = true;

    try {
      const orders = await dependencies.listOrders();

      // Remove cooldown entries for orders no longer pending.
      const pendingIds = new Set(orders.map((order) => order.id));

      for (const orderId of retryAfter.keys()) {
        if (!pendingIds.has(orderId)) {
          retryAfter.delete(orderId);
        }
      }

      const currentTime = now();

      const eligibleOrders = orders.filter((order) => {
        const nextRetryAt = retryAfter.get(order.id);

        return nextRetryAt === undefined || currentTime >= nextRetryAt;
      });

      if (eligibleOrders.length === 0 || stopping) {
        return;
      }

      const quote = await dependencies.getQuote();

      validateWorkerQuote(quote, maxQuoteAgeMs);

      for (const order of eligibleOrders) {
        if (stopping) {
          break;
        }

        try {
          const trigger = evaluateLimitTrigger(
            {
              orderType: order.orderType,
              requestedPrice: order.requestedPrice,
            },
            quote,
          );

          if (!trigger.triggered) {
            continue;
          }

          const userId = await dependencies.getUserId(order.accountId);

          if (!userId) {
            throw new Error(`Account not found: ${order.accountId}`);
          }

          // A previous order may have taken time to execute.
          // Never reuse an expired quote.
          validateWorkerQuote(quote, maxQuoteAgeMs);

          await dependencies.execute(userId, order.id, quote);
          retryAfter.delete(order.id);
        } catch (error) {
          const decision = classifyLimitError(error);

          if (decision.retryDelayMs > 0) {
            retryAfter.set(order.id, now() + decision.retryDelayMs);
          } else {
            retryAfter.delete(order.id);
          }

          dependencies.logError(
            error,
            `order=${order.id} action=${decision.action} retryDelayMs=${decision.retryDelayMs}`,
          );
        }
      }
    } catch (error) {
      dependencies.logError(error, "tick");
    } finally {
      running = false;
    }
  }

  function schedule(): void {
    if (stopping) {
      return;
    }

    timer = setTimeout(() => {
      active = tick().finally(() => {
        active = null;
        schedule();
      });
    }, intervalMs);
  }

  return {
    start() {
      if (stopping || timer || active) {
        return;
      }

      schedule();
    },

    async stop() {
      stopping = true;

      if (timer) {
        clearTimeout(timer);
      }

      timer = null;

      await active;
    },

    tick,
  };
}
