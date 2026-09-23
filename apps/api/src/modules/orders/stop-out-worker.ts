import { db } from "../../database/prisma.js";
import { XAUUSD_SPEC } from "../../common/constants/xauusd.js";
import { getTradingQuote } from "../market/service.js";
import type { MarketPriceResponse } from "../market/types.js";

import {
  rankStopOutCandidates,
  type StopOutCandidate,
} from "./stop-out-policy.js";

import { executeStopOutPosition } from "./service.js";
import { validateWorkerQuote } from "./stop-worker.js";

export interface StopOutWorkerPosition
  extends StopOutCandidate {
  accountId: string;
}

export interface StopOutWorkerDependencies {
  listPositions(): Promise<StopOutWorkerPosition[]>;

  getQuote(): Promise<MarketPriceResponse>;

  getUserId(accountId: string): Promise<string | null>;

  execute(
    userId: string,
    positionId: string,
    quote: MarketPriceResponse,
  ): Promise<unknown | null>;

  logError(error: unknown, context: string): void;
}

export const defaultStopOutWorkerDependencies:
  StopOutWorkerDependencies = {
    async listPositions() {
      const positions =
        await db.orm.public.Position.where({
          status: "OPEN",
        }).all();

      return positions.map((position) => ({
        id: position.id,
        accountId: position.accountId,
        side: position.side,
        quantity: Number(position.quantity),
        entryPrice: Number(position.averageEntryPrice),
        openedAt: position.openedAt,
      }));
    },

    getQuote: () =>
      getTradingQuote(XAUUSD_SPEC.symbol),

    async getUserId(accountId) {
      const account =
        await db.orm.public.DemoAccount.where({
          id: accountId,
        }).first();

      return account?.userId ?? null;
    },

    execute: executeStopOutPosition,

    logError(error, context) {
      console.error(
        `[stop-out-worker] ${context}`,
        error,
      );
    },
  };

export function createStopOutWorker(
  dependencies: StopOutWorkerDependencies =
    defaultStopOutWorkerDependencies,
  options: {
    intervalMs?: number;
    maxQuoteAgeMs?: number;
    now?: () => number;
  } = {},
) {
  const intervalMs =
    options.intervalMs ?? 1000;

  const maxQuoteAgeMs =
    options.maxQuoteAgeMs ?? 5000;

  const now =
    options.now ?? Date.now;

  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < 100
  ) {
    throw new Error(
      "STOP_OUT_WORKER_INTERVAL_MS must be an integer >= 100",
    );
  }

  if (
    !Number.isInteger(maxQuoteAgeMs) ||
    maxQuoteAgeMs < 100
  ) {
    throw new Error(
      "STOP_OUT_WORKER_MAX_QUOTE_AGE_MS must be an integer >= 100",
    );
  }

  let running = false;
  let stopping = false;

  let timer:
    ReturnType<typeof setTimeout> | null =
    null;

  let active:
    Promise<void> | null =
    null;

  async function tick(): Promise<void> {
    if (stopping || running) {
      return;
    }

    running = true;

    try {
      const positions =
        await dependencies.listPositions();

      if (
        positions.length === 0 ||
        stopping
      ) {
        return;
      }

      const quote =
        await dependencies.getQuote();

      validateWorkerQuote(
        quote,
        maxQuoteAgeMs,
        now(),
      );

      const bid = Number(quote.bid);
      const ask = Number(quote.ask);

      /*
       * Group by account first.
       *
       * Stop-Out is an account-level risk state.
       * Each account must therefore be liquidated
       * independently.
       */
      const positionsByAccount =
        new Map<
          string,
          StopOutWorkerPosition[]
        >();

      for (const position of positions) {
        const existing =
          positionsByAccount.get(
            position.accountId,
          );

        if (existing) {
          existing.push(position);
        } else {
          positionsByAccount.set(
            position.accountId,
            [position],
          );
        }
      }

      for (
        const [
          accountId,
          accountPositions,
        ] of positionsByAccount
      ) {
        if (stopping) {
          break;
        }

        try {
          const userId =
            await dependencies.getUserId(
              accountId,
            );

          if (!userId) {
            throw new Error(
              `Account not found: ${accountId}`,
            );
          }

          const ranked =
            rankStopOutCandidates(
              accountPositions,
              bid,
              ask,
            );

          for (const position of ranked) {
            if (stopping) {
              break;
            }

            /*
             * Earlier liquidations may take time.
             * Never execute using a quote that has
             * become stale while processing.
             */
            validateWorkerQuote(
              quote,
              maxQuoteAgeMs,
              now(),
            );

            /*
             * Transaction layer takes the account lock
             * and re-evaluates STOP_OUT.
             *
             * null means the account recovered, or this
             * position is no longer eligible.
             *
             * Stop processing this account immediately.
             */
            const result =
              await dependencies.execute(
                userId,
                position.id,
                quote,
              );

            if (result == null) {
              break;
            }
          }
        } catch (error) {
          dependencies.logError(
            error,
            `account=${accountId}`,
          );
        }
      }
    } catch (error) {
      dependencies.logError(
        error,
        "tick",
      );
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
      if (
        stopping ||
        timer ||
        active
      ) {
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