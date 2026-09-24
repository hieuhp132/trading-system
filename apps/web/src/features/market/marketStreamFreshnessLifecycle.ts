import type {
  MarketFreshnessEvent,
} from "./stream";

export function getFreshnessAfterStreamOpen(
  _previous: MarketFreshnessEvent | null,
): MarketFreshnessEvent | null {
  /*
   * A newly opened SSE transport has not yet proven the
   * freshness of market data on that connection.
   *
   * The server immediately emits its current freshness
   * snapshot, so the UI stays WAITING only until that
   * snapshot arrives.
   */
  return null;
}
