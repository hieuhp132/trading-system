import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../database/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(
  __dirname,
  "../../../tmp/dukascopy-test/XAUUSD_M1_2026_COMPLETE.txt",
);

// ============================================================
// Chỉ import phần dữ liệu đang thiếu
// ============================================================

const IMPORT_FROM = new Date("2026-05-31T18:54:00.000Z");
const IMPORT_TO = new Date("2026-09-25T20:44:00.000Z");

const file = await fs.readFile(filePath, "utf8");

const lines = file
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

if (lines.length < 2) {
  throw new Error(`No rows found in ${filePath}`);
}

const rows = lines.slice(1);

type Candle = {
  symbol: string;
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  source: string;
};

const imported: Candle[] = [];

function parseTimestamp(raw: string): string | null {
  const value = raw.trim();

  if (!value) {
    return null;
  }

  // Ví dụ:
  // 2026-05-31 18:54:00
  // 2026-09-25 20:44:00+00:00

  const normalized = value.includes(" ")
    ? value.replace(" ", "T")
    : value;

  let date: Date;

  // Timestamp đã có timezone
  if (
    /Z$/i.test(normalized) ||
    /[+-]\d{2}:\d{2}$/.test(normalized)
  ) {
    date = new Date(normalized);
  } else {
    // Không có timezone -> coi source historical là UTC
    date = new Date(`${normalized}Z`);
  }

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

// ============================================================
// Parse + filter
// ============================================================

let invalidRows = 0;
let outsideRange = 0;

for (const row of rows) {
  const columns = row.split("\t");

  if (columns.length < 9) {
    invalidRows++;
    continue;
  }

  const [
    symbol,
    timeframe,
    datetime,
    open,
    high,
    low,
    close,
    _volume,
    source,
  ] = columns;

  if (
    !symbol ||
    !datetime ||
    !open ||
    !high ||
    !low ||
    !close ||
    timeframe?.trim() !== "1min"
  ) {
    invalidRows++;
    continue;
  }

  const time = parseTimestamp(datetime);

  if (!time) {
    invalidRows++;
    continue;
  }

  const candleTime = new Date(time);

  // Chỉ lấy đoạn đang thiếu
  if (
    candleTime < IMPORT_FROM ||
    candleTime > IMPORT_TO
  ) {
    outsideRange++;
    continue;
  }

  imported.push({
    symbol: symbol.trim(),
    time,
    open: open.trim(),
    high: high.trim(),
    low: low.trim(),
    close: close.trim(),
    source: (source ?? "dukascopy").trim() || "dukascopy",
  });
}

// ============================================================
// Summary trước khi insert
// ============================================================

console.log("");
console.log("========================================");
console.log("MarketCandle gap import");
console.log("========================================");

console.log(`File: ${filePath}`);
console.log(`Total file rows : ${rows.length}`);
console.log(`Invalid rows    : ${invalidRows}`);
console.log(`Outside range   : ${outsideRange}`);
console.log(`Rows to process : ${imported.length}`);

if (imported.length > 0) {
  console.log(`First candle    : ${imported[0].time}`);
  console.log(`Last candle     : ${imported[imported.length - 1].time}`);
}

console.log("========================================");
console.log("");

// ============================================================
// Insert
// ============================================================

let inserted = 0;
let duplicates = 0;
let failed = 0;

const CHUNK_SIZE = 1000;

for (let i = 0; i < imported.length; i += CHUNK_SIZE) {
  const chunk = imported.slice(i, i + CHUNK_SIZE);

  for (const candle of chunk) {
    try {
      await db.orm.public.MarketCandle.create({
        symbol: candle.symbol,
        interval: "1m",
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        source: candle.source,
      });

      inserted++;
    } catch (error) {
      // PostgreSQL unique_violation
      if ((error as { code?: string })?.code === "23505") {
        duplicates++;
        continue;
      }

      failed++;

      console.error(
        "[INSERT ERROR]",
        candle.time,
        candle.source,
        error,
      );
    }
  }

  console.log(
    `[${Math.min(i + CHUNK_SIZE, imported.length)}/${imported.length}] ` +
      `inserted=${inserted} duplicates=${duplicates} failed=${failed}`,
  );
}

console.log("");
console.log("========================================");
console.log("[OK] MarketCandle import completed");
console.log(`Inserted   : ${inserted}`);
console.log(`Duplicates : ${duplicates}`);
console.log(`Failed     : ${failed}`);
console.log(`Processed  : ${imported.length}`);
console.log("========================================");