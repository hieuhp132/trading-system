import type {
  ReferenceQuote,
} from "./quote-contract.js";

export type ReferenceQuoteFreshness =
  | "FRESH"
  | "STALE"
  | "MISSING";

export interface ReferenceQuoteFreshnessResult {
  status: ReferenceQuoteFreshness;
  ageMs: number | null;
}

export interface ReferenceQuoteFreshnessOptions {
  staleAfterMs: number;
}

function validateStaleAfterMs(
  staleAfterMs: number,
): void {
  if (
    !Number.isSafeInteger(staleAfterMs) ||
    staleAfterMs <= 0
  ) {
    throw new Error(
      "staleAfterMs must be a positive safe integer",
    );
  }
}

export function getReferenceQuoteFreshness(
  quote: ReferenceQuote | null,
  nowMs: number,
  options: ReferenceQuoteFreshnessOptions,
): ReferenceQuoteFreshnessResult {
  validateStaleAfterMs(options.staleAfterMs);

  if (!Number.isFinite(nowMs)) {
    throw new Error("nowMs must be finite");
  }

  if (quote === null) {
    return {
      status: "MISSING",
      ageMs: null,
    };
  }

  const receivedAtMs =
    Date.parse(quote.receivedAt);

  if (!Number.isFinite(receivedAtMs)) {
    throw new Error(
      "Reference quote receivedAt must be a valid timestamp",
    );
  }

  const ageMs =
    Math.max(0, nowMs - receivedAtMs);

  return {
    status:
      ageMs <= options.staleAfterMs
        ? "FRESH"
        : "STALE",
    ageMs,
  };
}
