import type {
  MarketFreshnessEvent,
} from "./stream";

export type MarketFreshnessDisplayState =
  | "LIVE"
  | "STALE"
  | "WAITING"
  | "DISCONNECTED";

export interface MarketFreshnessDisplayInput {
  connected: boolean;
  freshness: MarketFreshnessEvent | null;
}

export function getMarketFreshnessDisplayState({
  connected,
  freshness,
}: MarketFreshnessDisplayInput): MarketFreshnessDisplayState {
  /*
   * Transport state and market-data freshness are intentionally
   * independent.
   *
   * When SSE is disconnected we report transport loss directly.
   * We do not infer that the last quote itself is stale.
   */
  if (!connected) {
    return "DISCONNECTED";
  }

  /*
   * The SSE transport can already be open before the first
   * freshness event arrives.
   */
  if (!freshness) {
    return "WAITING";
  }

  switch (freshness.status) {
    case "FRESH":
      return "LIVE";

    case "STALE":
      return "STALE";

    case "MISSING":
      return "WAITING";
  }
}
