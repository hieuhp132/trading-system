import { createClient, type RedisClientType } from "redis";

export interface SharedMarketCacheOptions {
  priceTtlMs?: number;
  candleTtlMs?: number;
}

export interface SharedMarketPriceCacheValue {
  value: {
    symbol: string;
    bid: string;
    ask: string;
    last: string;
    source: string;
    timestamp: string;
  };
  expiresAt: number;
}

export interface SharedMarketCandlesCacheValue {
  value: {
    symbol: string;
    interval: string;
    source: string;
    items: Array<{
      time: number;
      open: string;
      high: string;
      low: string;
      close: string;
    }>;
  };
  expiresAt: number;
}

export class SharedMarketCache {
  private readonly priceEntries = new Map<string, SharedMarketPriceCacheValue>();
  private readonly candleEntries = new Map<string, SharedMarketCandlesCacheValue>();
  private readonly priceInFlight = new Map<string, Promise<SharedMarketPriceCacheValue["value"]>>();
  private readonly candleInFlight = new Map<string, Promise<SharedMarketCandlesCacheValue["value"]>>();
  private redisClient: RedisClientType | null;

  private readonly priceTtlMs: number;
  private readonly candleTtlMs: number;

  constructor(options: SharedMarketCacheOptions = {}) {
    this.priceTtlMs = options.priceTtlMs ?? 10_000;
    this.candleTtlMs = options.candleTtlMs ?? 60_000;

    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl) {
      this.redisClient = createClient({ url: redisUrl } as { url: string });
      this.redisClient
        .connect()
        .catch((error) => {
          console.warn("[market-cache] redis unavailable, falling back to in-memory cache", error);
          this.redisClient = null;
        });
    } else {
      this.redisClient = null;
    }
  }

  async getOrCreatePrice(
    symbol: string,
    factory: () => Promise<SharedMarketPriceCacheValue["value"]>,
  ): Promise<SharedMarketPriceCacheValue["value"]> {
    const normalized = this.normalizeSymbol(symbol);
    const cachedValue = await this.getRedisPrice(normalized);
    if (cachedValue) {
      const receivedAtMs = Date.parse(cachedValue.timestamp);
      const remainingTtlMs = Number.isFinite(receivedAtMs)
        ? this.priceTtlMs - (Date.now() - receivedAtMs)
        : 0;

      if (remainingTtlMs > 0) {
        this.priceEntries.set(normalized, {
          value: cachedValue,
          expiresAt: Date.now() + remainingTtlMs,
        });
        return cachedValue;
      }
    }

    const existing = this.priceEntries.get(normalized);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.value;
    }

    const inFlight = this.priceInFlight.get(normalized);
    if (inFlight) {
      return inFlight;
    }

    const pending = factory().then(async (value) => {
      this.priceEntries.set(normalized, {
        value,
        expiresAt: Date.now() + this.priceTtlMs,
      });
      await this.setRedisPrice(normalized, value, this.priceTtlMs);
      this.priceInFlight.delete(normalized);
      return value;
    }).catch((error) => {
      this.priceInFlight.delete(normalized);
      throw error;
    });

    this.priceInFlight.set(normalized, pending);
    return pending;
  }

  async getOrCreateCandles(
    symbol: string,
    interval: string,
    factory: () => Promise<SharedMarketCandlesCacheValue["value"]>,
  ): Promise<SharedMarketCandlesCacheValue["value"]> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const key = `${normalizedSymbol}:${interval}`;
    const cachedValue = await this.getRedisCandles(key);
    if (cachedValue) {
      this.candleEntries.set(key, {
        value: cachedValue,
        expiresAt: Date.now() + this.candleTtlMs,
      });
      return cachedValue;
    }

    const existing = this.candleEntries.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.value;
    }

    const inFlight = this.candleInFlight.get(key);
    if (inFlight) {
      return inFlight;
    }

    const pending = factory().then(async (value) => {
      this.candleEntries.set(key, {
        value,
        expiresAt: Date.now() + this.candleTtlMs,
      });
      await this.setRedisCandles(key, value, this.candleTtlMs);
      this.candleInFlight.delete(key);
      return value;
    }).catch((error) => {
      this.candleInFlight.delete(key);
      throw error;
    });

    this.candleInFlight.set(key, pending);
    return pending;
  }

  async clear(): Promise<void> {
    this.priceEntries.clear();
    this.candleEntries.clear();
    this.priceInFlight.clear();
    this.candleInFlight.clear();

    if (this.redisClient) {
      await this.redisClient.flushAll();
    }
  }

  invalidatePrice(symbol: string): void {
    const normalized = this.normalizeSymbol(symbol);
    this.priceEntries.delete(normalized);
    this.priceInFlight.delete(normalized);

    if (this.redisClient) {
      void this.redisClient.del(this.redisKey("price", normalized));
    }
  }

  invalidateCandles(symbol: string, interval: string): void {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const key = `${normalizedSymbol}:${interval}`;
    this.candleEntries.delete(key);
    this.candleInFlight.delete(key);

    if (this.redisClient) {
      void this.redisClient.del(this.redisKey("candles", key));
    }
  }

  private async getRedisPrice(symbol: string): Promise<SharedMarketPriceCacheValue["value"] | null> {
    if (!this.redisClient) {
      return null;
    }

    const raw = await this.redisClient.get(this.redisKey("price", symbol));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SharedMarketPriceCacheValue["value"];
      return parsed;
    } catch {
      return null;
    }
  }

  private async setRedisPrice(
    symbol: string,
    value: SharedMarketPriceCacheValue["value"],
    ttlMs: number,
  ): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    await this.redisClient.set(this.redisKey("price", symbol), JSON.stringify(value), {
      PX: ttlMs,
    });
  }

  private async getRedisCandles(key: string): Promise<SharedMarketCandlesCacheValue["value"] | null> {
    if (!this.redisClient) {
      return null;
    }

    const raw = await this.redisClient.get(this.redisKey("candles", key));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as SharedMarketCandlesCacheValue["value"];
      return parsed;
    } catch {
      return null;
    }
  }

  private async setRedisCandles(
    key: string,
    value: SharedMarketCandlesCacheValue["value"],
    ttlMs: number,
  ): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    await this.redisClient.set(this.redisKey("candles", key), JSON.stringify(value), {
      PX: ttlMs,
    });
  }

  private redisKey(type: "price" | "candles", identifier: string): string {
    return `market:${type}:${identifier}`;
  }

  private normalizeSymbol(symbol: string): string {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      throw new Error("symbol must not be empty");
    }
    return normalized;
  }
}
