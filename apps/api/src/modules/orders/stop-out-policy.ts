import { calculateUnrealizedPnl } from "../../common/utils/pnl.js";

export interface StopOutCandidate {
  id: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  openedAt: string | Date;
}

export interface RankedStopOutCandidate
  extends StopOutCandidate {
  unrealizedPnl: number;
}

/**
 * Stop-Out liquidation policy:
 *
 * 1. Largest unrealized loss first.
 * 2. If P&L is equal, older position first.
 * 3. If openedAt is equal, lexicographically smaller id first.
 *
 * This function is pure and never mutates the input array.
 *
 * LONG is valued at BID.
 * SHORT is valued at ASK.
 */
export function rankStopOutCandidates(
  positions: readonly StopOutCandidate[],
  bid: number,
  ask: number,
): RankedStopOutCandidate[] {
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new Error("Invalid Stop-Out BID/ASK");
  }

  const ranked = positions.map((position) => {
    if (
      position.side !== "LONG" &&
      position.side !== "SHORT"
    ) {
      throw new Error(
        `Invalid position side: ${String(position.side)}`,
      );
    }

    if (
      !Number.isFinite(position.quantity) ||
      position.quantity <= 0
    ) {
      throw new Error(
        `Invalid position quantity: ${position.id}`,
      );
    }

    if (
      !Number.isFinite(position.entryPrice) ||
      position.entryPrice <= 0
    ) {
      throw new Error(
        `Invalid position entry price: ${position.id}`,
      );
    }

    const openedAtMs =
      position.openedAt instanceof Date
        ? position.openedAt.getTime()
        : Date.parse(position.openedAt);

    if (!Number.isFinite(openedAtMs)) {
      throw new Error(
        `Invalid position openedAt: ${position.id}`,
      );
    }

    const currentPrice =
      position.side === "LONG"
        ? bid
        : ask;

    const unrealizedPnl =
      calculateUnrealizedPnl(
        position.side,
        position.quantity,
        position.entryPrice,
        currentPrice,
      );

    if (!Number.isFinite(unrealizedPnl)) {
      throw new Error(
        `Invalid position P&L: ${position.id}`,
      );
    }

    return {
      ...position,
      unrealizedPnl,
      openedAtMs,
    };
  });

  ranked.sort((a, b) => {
    // More negative P&L = larger loss = liquidate first.
    if (a.unrealizedPnl !== b.unrealizedPnl) {
      return a.unrealizedPnl - b.unrealizedPnl;
    }

    // Older position first.
    if (a.openedAtMs !== b.openedAtMs) {
      return a.openedAtMs - b.openedAtMs;
    }

    // Final deterministic tie-break.
    return a.id.localeCompare(b.id);
  });

  return ranked.map(
    ({ openedAtMs: _openedAtMs, ...position }) =>
      position,
  );
}
