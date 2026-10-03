import type { MarketPrice } from "./api";

const DEFAULT_API_BASE_URL =
  "http://localhost:4001/api/v1";

function normalizeApiBaseUrl(
  baseUrl: string,
): string {
  const normalized =
    baseUrl.trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error(
      "Market stream API base URL is empty",
    );
  }

  return normalized;
}

export function getMarketStreamUrl(
  symbol = "XAUUSD",
  baseUrl =
    import.meta.env.VITE_API_BASE_URL ??
    DEFAULT_API_BASE_URL,
): string {
  const normalizedSymbol =
    symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    throw new Error(
      "Market stream symbol is empty",
    );
  }

  const normalizedBaseUrl =
    normalizeApiBaseUrl(baseUrl);

  return (
    `${normalizedBaseUrl}/market/stream` +
    `?symbol=${encodeURIComponent(normalizedSymbol)}`
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

export function parseMarketPriceEvent(
  rawData: string,
): MarketPrice {
  const parsed: unknown =
    JSON.parse(rawData);

  if (!isRecord(parsed)) {
    throw new Error(
      "Invalid market stream payload",
    );
  }

  const metadata =
    parsed.metadata;

  if (!isRecord(metadata)) {
    throw new Error(
      "Invalid market stream metadata",
    );
  }

  const source =
    parsed.source;

  const bidAskType =
    metadata.bidAskType;

  if (
    typeof parsed.symbol !== "string" ||
    typeof parsed.bid !== "string" ||
    typeof parsed.ask !== "string" ||
    typeof parsed.last !== "string" ||
    (
      source !== "demo" &&
      source !== "twelve-data"
    ) ||
    typeof parsed.timestamp !== "string" ||
    typeof metadata.receivedAt !== "string" ||
    !(
      metadata.sourceTimestamp === null ||
      typeof metadata.sourceTimestamp === "string"
    ) ||
    (
      bidAskType !== "REAL" &&
      bidAskType !== "SYNTHETIC"
    ) ||
    typeof metadata.executable !== "boolean"
  ) {
    throw new Error(
      "Invalid market stream payload",
    );
  }

  return {
    symbol:
      parsed.symbol,

    bid:
      parsed.bid,

    ask:
      parsed.ask,

    last:
      parsed.last,

    source,

    timestamp:
      parsed.timestamp,

    metadata: {
      receivedAt:
        metadata.receivedAt,

      sourceTimestamp:
        metadata.sourceTimestamp as string | null,

      bidAskType,

      executable:
        metadata.executable,
    },
  };
}

export type MarketDataFreshness =
  | "FRESH"
  | "STALE"
  | "MISSING";

export interface MarketFreshnessEvent {
  symbol: string;
  status: MarketDataFreshness;
  ageMs: number | null;
}

export function parseMarketFreshnessEvent(
  rawData: string,
): MarketFreshnessEvent {
  const parsed: unknown =
    JSON.parse(rawData);

  if (!isRecord(parsed)) {
    throw new Error(
      "Invalid market freshness payload",
    );
  }

  const symbol =
    typeof parsed.symbol === "string"
      ? parsed.symbol.trim().toUpperCase()
      : "";

  const status =
    parsed.status;

  const ageMs =
    parsed.ageMs;

  if (
    !symbol ||
    (
      status !== "FRESH" &&
      status !== "STALE" &&
      status !== "MISSING"
    ) ||
    !(
      ageMs === null ||
      (
        typeof ageMs === "number" &&
        Number.isFinite(ageMs) &&
        Number.isSafeInteger(ageMs) &&
        ageMs >= 0
      )
    )
  ) {
    throw new Error(
      "Invalid market freshness payload",
    );
  }

  /*
   * MISSING has no quote timestamp, therefore it must not
   * carry an age.
   *
   * FRESH/STALE describe an existing cached quote and must
   * carry its non-negative age.
   */
  if (
    (
      status === "MISSING" &&
      ageMs !== null
    ) ||
    (
      status !== "MISSING" &&
      ageMs === null
    )
  ) {
    throw new Error(
      "Invalid market freshness payload",
    );
  }

  return {
    symbol,
    status,
    ageMs,
  };
}
