import "dotenv/config";

import { db } from "../../database/prisma.js";
import type {
  CandleInterval,
} from "./types.js";

const SYMBOL = "XAUUSD";
type AggregatedInterval = Exclude<CandleInterval, "1m">;

const TARGET_INTERVALS: AggregatedInterval[] = [
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];
const INTERVAL_SECONDS: Record<Exclude<CandleInterval, "1m">, number> = {
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

async function countMinuteHistory(): Promise<number> {
  const plan = db.raw.sql`
    SELECT COUNT(*)::text AS "count"
    FROM "public"."historicalMarketCandleFull"
    WHERE "symbol" = ${SYMBOL} AND "interval" = '1m'
  `
    .returnsRow({ count: { codecId: "pg/text@1" } })
    .build();
  const [row] = await db.transaction((tx) => tx.query(plan));
  return Number(row?.count ?? 0);
}

async function backfillInterval(
  interval: AggregatedInterval,
  bucketSeconds: number,
): Promise<number> {
  const plan = db.raw.sql`
    INSERT INTO "public"."marketCandle" (
      "id", "symbol", "interval", "time", "open", "high", "low", "close", "source", "receivedAt"
    )
    SELECT
      md5(${SYMBOL} || ':' || ${interval} || ':' || bucket."bucket_time"::text),
      ${SYMBOL},
      ${interval},
      bucket."bucket_time",
      (array_agg(source."open" ORDER BY source."time"))[1],
      MAX(source."high"),
      MIN(source."low"),
      (array_agg(source."close" ORDER BY source."time" DESC))[1],
      'historical-full',
      NOW()
    FROM "public"."historicalMarketCandleFull" AS source
    CROSS JOIN LATERAL (
      SELECT to_timestamp(
        floor(extract(epoch FROM source."time") / ${bucketSeconds}) * ${bucketSeconds}
      ) AS "bucket_time"
    ) AS bucket
    WHERE source."symbol" = ${SYMBOL}
      AND source."interval" = '1m'
    GROUP BY bucket."bucket_time"
    ON CONFLICT ("symbol", "interval", "time") DO NOTHING
    RETURNING "id"
  `
    .returnsRow({ id: { codecId: "pg/text@1" } })
    .build();

  const rows = await db.transaction((tx) => tx.query(plan));
  return rows.length;
}

async function main(): Promise<void> {
  const minuteCount = await countMinuteHistory();
  if (minuteCount === 0) {
    throw new Error("No persisted 1m candles found; backfill aborted");
  }

  console.log(`Found ${minuteCount} full-history 1m candles`);

  for (const interval of TARGET_INTERVALS) {
    const inserted = await backfillInterval(
      interval,
      INTERVAL_SECONDS[interval],
    );
    console.log(`Inserted ${inserted} missing ${interval} candles`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("[FAIL] timeframe history backfill", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.close();
  });