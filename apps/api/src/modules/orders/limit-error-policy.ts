export type LimitErrorAction = "DEFER" | "RETRY" | "INVESTIGATE";

export interface LimitErrorDecision {
  action: LimitErrorAction;
  code: string;
  retryDelayMs: number;
}

const DEFERRED_CODES = new Set([
  "INSUFFICIENT_MARGIN",
  "INVALID_STOP_LOSS",
  "INVALID_TAKE_PROFIT",
  "POSITION_STOPS_UPDATE_REQUIRED",
]);

const RETRY_CODES = new Set(["STALE_MARKET_QUOTE"]);

export function classifyLimitError(error: unknown): LimitErrorDecision {
  const code =
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "UNKNOWN_ERROR";

  if (DEFERRED_CODES.has(code)) {
    return {
      action: "DEFER",
      code,
      retryDelayMs: 30_000,
    };
  }

  if (RETRY_CODES.has(code)) {
    return {
      action: "RETRY",
      code,
      retryDelayMs: 0,
    };
  }

  return {
    action: "INVESTIGATE",
    code,
    retryDelayMs: 30_000,
  };
}
