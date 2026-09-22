import { AppError } from "../../../common/errors/app-error.js";
import { fetchJson } from "../../../common/utils/http.js";
import { reserveTwelveDataCredits } from "../twelve-data-budget.js";

import type {
  CandleInterval,
  MarketCandlesResponse,
  MarketCandle,
  MarketPriceResponse,
} from "../types.js";

import type { MarketDataProvider } from "./market-data-provider.js";

interface TwelveDataPriceResponse {
  price?: string;
  status?: string;
  code?: number;
  message?: string;
}

interface TwelveDataTimeSeriesValue {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
}

interface TwelveDataTimeSeriesResponse {
  meta?: {
    symbol?: string;
    interval?: string;
    currency_base?: string;
    currency_quote?: string;
  };
  values?: TwelveDataTimeSeriesValue[];
  status?: string;
  code?: number;
  message?: string;
}

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";

const DEFAULT_SYMBOL = "XAU/USD";

const INTERVAL_MAP: Record<CandleInterval, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
};

export class TwelveDataProvider implements MarketDataProvider {
  private cachedPrice: MarketPriceResponse | null = null;
  private cacheExpiresAt = 0;
  private pendingPriceRequest: Promise<MarketPriceResponse> | null = null;

  private readonly priceCacheTtlMs = 60_000;

  private readonly apiKey: string;
  private readonly symbol: string;

  constructor() {
    const apiKey = process.env.TWELVE_DATA_API_KEY;

    if (!apiKey) {
      throw new AppError(
        "TWELVE_DATA_API_KEY chưa được cấu hình",
        500,
        "MARKET_DATA_CONFIG_ERROR",
      );
    }

    this.apiKey = apiKey;
    this.symbol = process.env.TWELVE_DATA_SYMBOL ?? DEFAULT_SYMBOL;
  }

  private validateSymbol(symbol: string): void {
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (normalizedSymbol !== "XAUUSD") {
      throw new AppError(
        `Symbol ${normalizedSymbol} chưa được hỗ trợ`,
        400,
        "UNSUPPORTED_SYMBOL",
      );
    }
  }

  async getPrice(symbol: string): Promise<MarketPriceResponse> {
    this.validateSymbol(symbol);

    if (
      this.cachedPrice &&
      Date.now() < this.cacheExpiresAt
    ) {
      return this.cachedPrice;
    }

    return this.requestPrice();
  }

  async getTradingPrice(symbol: string): Promise<MarketPriceResponse> {
    this.validateSymbol(symbol);

    if (this.cachedPrice) {
      const timestamp = Date.parse(this.cachedPrice.timestamp);

      if (
        Number.isFinite(timestamp) &&
        timestamp <= Date.now() + 1_000 &&
        Date.now() - timestamp <= 5_000
      ) {
        return this.cachedPrice;
      }
    }

    return this.requestPrice();
  }

  private async requestPrice(): Promise<MarketPriceResponse> {
    if (this.pendingPriceRequest) {
      return this.pendingPriceRequest;
    }

    const request = this.fetchFreshPrice();
    this.pendingPriceRequest = request;

    try {
      const price = await request;

      this.cachedPrice = price;
      this.cacheExpiresAt = Date.now() + this.priceCacheTtlMs;

      return price;
    } finally {
      if (this.pendingPriceRequest === request) {
        this.pendingPriceRequest = null;
      }
    }
  }

  private async fetchFreshPrice(): Promise<MarketPriceResponse> {
    const url = new URL(`${TWELVE_DATA_BASE_URL}/price`);

    url.searchParams.set("symbol", this.symbol);

    await reserveTwelveDataCredits(1);

    const response = await fetchJson<TwelveDataPriceResponse>(
      url.toString(),
      {
        headers: {
          Authorization: `apikey ${this.apiKey}`,
        },
      },
    );

    if (!response.price || response.status === "error") {
      throw new AppError(
        response.message ?? "Không lấy được giá từ Twelve Data",
        502,
        "MARKET_DATA_PROVIDER_ERROR",
      );
    }

    const last = Number(response.price);

    if (!Number.isFinite(last) || last <= 0) {
      throw new AppError(
        "Provider trả về giá không hợp lệ",
        502,
        "INVALID_MARKET_PRICE",
      );
    }

    // BID/ASK mô phỏng từ giá tham chiếu Twelve Data.
    const spread = 0.2;

    const bid = last - spread / 2;
    const ask = last + spread / 2;

    return {
      symbol: "XAUUSD",
      bid: bid.toFixed(2),
      ask: ask.toFixed(2),
      last: last.toFixed(2),
      source: "twelve-data",
      timestamp: new Date().toISOString(),
    };
  }
  async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number,
  ): Promise<MarketCandlesResponse> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (normalizedSymbol !== "XAUUSD") {
      throw new AppError(
        `Symbol ${normalizedSymbol} chưa được hỗ trợ`,
        400,
        "UNSUPPORTED_SYMBOL",
      );
    }

    const twelveDataInterval = INTERVAL_MAP[interval];

    if (!twelveDataInterval) {
      throw new AppError(
        `Interval ${interval} chưa được hỗ trợ`,
        400,
        "UNSUPPORTED_CANDLE_INTERVAL",
      );
    }

    const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);

    url.searchParams.set("symbol", this.symbol);

    url.searchParams.set("interval", twelveDataInterval);

    url.searchParams.set("outputsize", String(limit));

    await reserveTwelveDataCredits(1);

    const response = await fetchJson<TwelveDataTimeSeriesResponse>(
      url.toString(),
      {
        headers: {
          Authorization: `apikey ${this.apiKey}`,
        },
      },
    );

    if (response.status === "error" || !response.values) {
      throw new AppError(
        response.message ?? "Không lấy được dữ liệu candles từ Twelve Data",
        502,
        "MARKET_DATA_PROVIDER_ERROR",
      );
    }

    const candles: MarketCandle[] = response.values
      .map((item) => {
        if (
          !item.datetime ||
          !item.open ||
          !item.high ||
          !item.low ||
          !item.close
        ) {
          return null;
        }

        const time = Date.parse(`${item.datetime}Z`) / 1000;

        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);

        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          return null;
        }

        return {
          time,
          open: open.toFixed(2),
          high: high.toFixed(2),
          low: low.toFixed(2),
          close: close.toFixed(2),
        };
      })
      .filter((candle): candle is MarketCandle => candle !== null)
      .sort((a, b) => a.time - b.time);

    if (candles.length === 0) {
      throw new AppError(
        "Twelve Data không trả về candle hợp lệ",
        502,
        "INVALID_MARKET_CANDLES",
      );
    }

    return {
      symbol: "XAUUSD",
      interval,
      source: "twelve-data",
      items: candles,
    };
  }
}
