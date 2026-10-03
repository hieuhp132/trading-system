from pathlib import Path

from histdata_fetcher import fetch_data


# ============================================================
# CONFIG
# ============================================================

PAIR = "XAUUSD"
TIMEFRAME = "1min"

START_DATE = "2009-01-01"
END_DATE = "2026-09-27"

OUTPUT_FILE = Path("XAUUSD_M1_2009_2026.txt")


# ============================================================
# FETCH DATA
# ============================================================

print("=" * 60)
print("Downloading historical data")
print("=" * 60)

print(f"Pair      : {PAIR}")
print(f"Timeframe : {TIMEFRAME}")
print(f"From      : {START_DATE}")
print(f"To        : {END_DATE}")
print()

result = fetch_data(
    PAIR,
    START_DATE,
    END_DATE,
    TIMEFRAME,
)


# ============================================================
# VALIDATE
# ============================================================

df = result.data

print()
print("=" * 60)
print("Download result")
print("=" * 60)

print(f"Fetched periods : {len(result.fetched_periods)}")
print(f"Failed periods  : {result.failed_periods}")
print(f"Rows            : {len(df):,}")

if df.empty:
    raise RuntimeError("No XAUUSD data returned.")

if result.failed_periods:
    print()
    print("WARNING: Some periods failed:")
    for period in result.failed_periods:
        print(f"  - {period}")


# ============================================================
# SORT + REMOVE DUPLICATES
# ============================================================

print()
print("Sorting data...")

df = df.sort_values("datetime")

before = len(df)

df = df.drop_duplicates(
    subset=["datetime"],
    keep="last",
)

removed = before - len(df)

print(f"Duplicate candles removed: {removed:,}")


# ============================================================
# VALIDATE OHLC
# ============================================================

invalid = df[
    (df["high"] < df["low"])
    | (df["high"] < df["open"])
    | (df["high"] < df["close"])
    | (df["low"] > df["open"])
    | (df["low"] > df["close"])
]

if not invalid.empty:
    raise RuntimeError(
        f"Found {len(invalid):,} invalid OHLC candles."
    )

print("OHLC validation: OK")


# ============================================================
# ADD DATABASE FIELDS
# ============================================================

df.insert(0, "symbol", PAIR)
df.insert(1, "timeframe", TIMEFRAME)

df["source"] = "HISTDATA"


# ============================================================
# FORMAT DATETIME
# ============================================================

df["datetime"] = df["datetime"].dt.strftime(
    "%Y-%m-%d %H:%M:%S"
)


# ============================================================
# SELECT FINAL COLUMN ORDER
# ============================================================

df = df[
    [
        "symbol",
        "timeframe",
        "datetime",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "source",
    ]
]


# ============================================================
# WRITE TXT / TSV
# ============================================================

print()
print(f"Writing {len(df):,} candles to:")
print(OUTPUT_FILE.resolve())

df.to_csv(
    OUTPUT_FILE,
    sep="\t",
    index=False,
    header=True,
    encoding="utf-8",
)


# ============================================================
# RESULT
# ============================================================

print()
print("=" * 60)
print("EXPORT COMPLETE")
print("=" * 60)

print(f"Rows       : {len(df):,}")
print(f"First      : {df.iloc[0]['datetime']}")
print(f"Last       : {df.iloc[-1]['datetime']}")
print(f"Output     : {OUTPUT_FILE.resolve()}")

print()
print("First 5 rows:")
print(df.head().to_string(index=False))

print()
print("Last 5 rows:")
print(df.tail().to_string(index=False))
