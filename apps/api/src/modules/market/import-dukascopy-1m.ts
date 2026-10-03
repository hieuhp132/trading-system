import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../database/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(
  __dirname,
  "../../../tmp/dukascopy-test/XAUUSD_M1_2009_2026.txt",
);

const file = await fs.readFile(filePath, "utf8");
const lines = file.split(/\r?\n/).filter((line) => line.trim().length > 0);

if (lines.length < 2) {
  throw new Error(`No Dukascopy rows found in ${filePath}`);
}

const rows = lines.slice(1);

const imported = [] as Array<{
  symbol: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  source: string;
}>;

function parseDukascopyTimestamp(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;

  if (/[+-]\d{2}:\d{2}$/.test(normalized)) {
    const date = new Date(normalized);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  const date = new Date(`${normalized}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

for (const row of rows) {
  const columns = row.split("\t");

  if (columns.length < 9) {
    continue;
  }

  const [symbol, timeframe, datetime, open, high, low, close, volume, source] =
    columns;

  if (
    !symbol ||
    !datetime ||
    !open ||
    !high ||
    !low ||
    !close ||
    timeframe?.trim() !== "1min"
  ) {
    continue;
  }

  const time = parseDukascopyTimestamp(datetime);

  if (!time) {
    continue;
  }

  imported.push({
    symbol: symbol.trim(),
    time,
    open: String(open).trim(),
    high: String(high).trim(),
    low: String(low).trim(),
    close: String(close).trim(),
    source: (source ?? "dukascopy").trim() || "dukascopy",
  });
}

const testImported = imported.slice(0, 10);
console.log(`TEST MODE: importing ${testImported.length} candles`);

for (let i = 0; i < testImported.length; i += 1000) {
  const chunk = testImported.slice(i, i + 1000);

  for (const candle of chunk) {
    try {
      await db.orm.public.HistoricalMarketCandleFull.create({
        symbol: candle.symbol,
        interval: "1m",
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        source: candle.source,
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505") {
        console.error("Skipping duplicate/invalid row:", candle, error);
        throw error;
      }
    }
  }

  console.log(
    `Imported rows ${i + 1}..${Math.min(i + 1000, testImported.length)}`,
  );
}

console.log(
  `[OK] Imported ${testImported.length} XAUUSD 1m rows into HistoricalMarketCandleFull`,
);
