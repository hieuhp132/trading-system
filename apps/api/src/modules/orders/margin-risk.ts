import { calculateUnrealizedPnl } from "../../common/utils/pnl.js";
import { calculateUsedMargin } from "../../common/utils/margin.js";
export type MarginRiskState =
  | "NORMAL"
  | "MARGIN_CALL"
  | "STOP_OUT";

export interface MarginRiskResult {
  equity: number;
  usedMargin: number;
  marginLevel: number | null;
  state: MarginRiskState;
}

function assertFiniteNumber(
  value: number,
  name: string,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
}

export function evaluateMarginRisk(
  equity: number,
  usedMargin: number,
  marginCallLevel: number,
  stopOutLevel: number,
): MarginRiskResult {
  assertFiniteNumber(equity, "equity");
  assertFiniteNumber(usedMargin, "usedMargin");
  assertFiniteNumber(marginCallLevel, "marginCallLevel");
  assertFiniteNumber(stopOutLevel, "stopOutLevel");

  if (usedMargin < 0) {
    throw new Error("usedMargin must be >= 0");
  }

  if (marginCallLevel <= 0 || stopOutLevel <= 0) {
    throw new Error("margin thresholds must be > 0");
  }

  if (stopOutLevel > marginCallLevel) {
    throw new Error(
      "stopOutLevel must be <= marginCallLevel",
    );
  }

  if (usedMargin === 0) {
    if (equity <= 0) {
      return {
        equity,
        usedMargin,
        marginLevel: null,
        state: "STOP_OUT",
      };
    }

    return {
      equity,
      usedMargin,
      marginLevel: null,
      state: "NORMAL",
    };
  }

  const marginLevel = (equity / usedMargin) * 100;

  if (marginLevel <= stopOutLevel) {
    return {
      equity,
      usedMargin,
      marginLevel,
      state: "STOP_OUT",
    };
  }

  if (marginLevel <= marginCallLevel) {
    return {
      equity,
      usedMargin,
      marginLevel,
      state: "MARGIN_CALL",
    };
  }

  return {
    equity,
    usedMargin,
    marginLevel,
    state: "NORMAL",
  };
}

export interface AccountRiskPosition {
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
}

export interface AccountRiskQuote {
  bid: number;
  ask: number;
}

export function calculateAccountMarginRisk(
  balance: number,
  leverage: number,
  marginCallLevel: number,
  stopOutLevel: number,
  positions: ReadonlyArray<AccountRiskPosition>,
  quote: AccountRiskQuote,
): MarginRiskResult {
  assertFiniteNumber(balance, "balance");
  assertFiniteNumber(leverage, "leverage");
  assertFiniteNumber(quote.bid, "bid");
  assertFiniteNumber(quote.ask, "ask");

  if (leverage <= 0) {
    throw new Error("leverage must be > 0");
  }

  if (quote.bid <= 0 || quote.ask <= 0 || quote.bid > quote.ask) {
    throw new Error("quote must contain valid bid/ask");
  }

  let unrealizedPnl = 0;

  const marginPositions = positions.map((position) => {
    assertFiniteNumber(position.quantity, "position.quantity");
    assertFiniteNumber(position.entryPrice, "position.entryPrice");

    if (position.quantity <= 0 || position.entryPrice <= 0) {
      throw new Error("position quantity and entry price must be > 0");
    }

    const currentPrice =
      position.side === "LONG"
        ? quote.bid
        : quote.ask;

    unrealizedPnl += calculateUnrealizedPnl(
      position.side,
      position.quantity,
      position.entryPrice,
      currentPrice,
    );

    return {
      quantity: position.quantity,
      entryPrice: position.entryPrice,
    };
  });

  const usedMargin = calculateUsedMargin(
    marginPositions,
    leverage,
  );

  const equity = balance + unrealizedPnl;

  return evaluateMarginRisk(
    equity,
    usedMargin,
    marginCallLevel,
    stopOutLevel,
  );
}