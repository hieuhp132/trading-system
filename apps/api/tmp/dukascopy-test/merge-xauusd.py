from pathlib import Path
import pandas as pd


# ============================================================
# CONFIG
# ============================================================

HISTDATA_FILE = Path("XAUUSD_M1_2009_2026.txt")
GETDATA_FILE = Path("getdata/XAUUSD_1m.csv")

OUTPUT_FILE = Path("XAUUSD_M1_2026_COMPLETE.txt")

# HistData hiện kết thúc vào Friday 18/09.
# GetData bắt đầu bổ sung từ phiên tiếp theo.
GETDATA_START = pd.Timestamp(
    "2026-09-20T22:01:00Z"
)


# ============================================================
# LOAD HISTDATA
# ============================================================

print("=" * 70)
print("LOADING HISTDATA")
print("=" * 70)

hist = pd.read_csv(
    HISTDATA_FILE,
    sep="\t",
)

hist["datetime"] = pd.to_datetime(
    hist["datetime"],
    errors="coerce",
)

invalid_hist_datetime = hist["datetime"].isna().sum()

hist = hist.dropna(
    subset=["datetime"]
).copy()

# Chỉ lấy năm 2026
hist = hist[
    hist["datetime"].dt.year == 2026
].copy()

hist["source"] = "HISTDATA"

print(f"Rows             : {len(hist):,}")
print(f"Invalid datetime : {invalid_hist_datetime:,}")
print(f"First            : {hist['datetime'].min()}")
print(f"Last             : {hist['datetime'].max()}")


# ============================================================
# LOAD GETDATA
# ============================================================

print()
print("=" * 70)
print("LOADING GETDATA")
print("=" * 70)

get = pd.read_csv(GETDATA_FILE)

get["datetime"] = pd.to_datetime(
    get["datetime"],
    utc=True,
    errors="coerce",
)

invalid_get_datetime = get["datetime"].isna().sum()

get = get.dropna(
    subset=["datetime"]
).copy()

print(f"Rows             : {len(get):,}")
print(f"Invalid datetime : {invalid_get_datetime:,}")
print(f"First            : {get['datetime'].min()}")
print(f"Last             : {get['datetime'].max()}")


# ============================================================
# SELECT ONLY NEW GETDATA
# ============================================================

print()
print("=" * 70)
print("SELECTING GETDATA GAP FILL")
print("=" * 70)

get_new = get[
    get["datetime"] >= GETDATA_START
].copy()

get_new["source"] = "GETDATA"

print(f"Start : {GETDATA_START}")
print(f"Rows  : {len(get_new):,}")

if get_new.empty:
    raise RuntimeError(
        "No GetData candles found after GETDATA_START."
    )

print(f"First : {get_new['datetime'].min()}")
print(f"Last  : {get_new['datetime'].max()}")


# ============================================================
# VALIDATE GETDATA OHLC
# ============================================================

invalid_ohlc = get_new[
    (get_new["high"] < get_new["low"])
    | (get_new["high"] < get_new["open"])
    | (get_new["high"] < get_new["close"])
    | (get_new["low"] > get_new["open"])
    | (get_new["low"] > get_new["close"])
]

print()
print("=" * 70)
print("VALIDATING GETDATA")
print("=" * 70)

print(
    f"Invalid OHLC : {len(invalid_ohlc):,}"
)

if not invalid_ohlc.empty:
    raise RuntimeError(
        f"Found {len(invalid_ohlc):,} invalid GetData candles."
    )


# ============================================================
# CHECK GETDATA DUPLICATES
# ============================================================

duplicate_get = get_new.duplicated(
    subset=["datetime"],
    keep=False,
)

duplicate_count = duplicate_get.sum()

print(
    f"Duplicate timestamps : {duplicate_count:,}"
)

if duplicate_count:
    print()
    print(
        get_new.loc[
            duplicate_get,
            [
                "datetime",
                "open",
                "high",
                "low",
                "close",
            ],
        ]
        .head(20)
        .to_string(index=False)
    )

    raise RuntimeError(
        "Duplicate GetData timestamps found."
    )


# ============================================================
# ANALYZE GETDATA GAPS
# ============================================================

get_new = get_new.sort_values(
    "datetime"
).reset_index(drop=True)

get_new["previous_datetime"] = (
    get_new["datetime"].shift(1)
)

get_new["gap_minutes"] = (
    (
        get_new["datetime"]
        - get_new["previous_datetime"]
    )
    .dt.total_seconds()
    .div(60)
)

gaps = get_new[
    get_new["gap_minutes"] > 1
].copy()

print()
print("=" * 70)
print("GETDATA GAP ANALYSIS")
print("=" * 70)

print(f"Total gaps > 1 minute : {len(gaps):,}")

if not gaps.empty:

    gaps["missing_minutes"] = (
        gaps["gap_minutes"] - 1
    ).astype(int)

    print(
        f"Total absent minutes  : "
        f"{gaps['missing_minutes'].sum():,}"
    )

    print()
    print("Largest gaps:")

    print(
        gaps[
            [
                "previous_datetime",
                "datetime",
                "gap_minutes",
                "missing_minutes",
            ]
        ]
        .sort_values(
            "gap_minutes",
            ascending=False,
        )
        .head(30)
        .to_string(index=False)
    )


# ============================================================
# PREPARE FINAL COLUMNS
# ============================================================

# HistData đã có symbol/timeframe.
# Đảm bảo GetData có cùng schema.

get_new.insert(
    0,
    "symbol",
    "XAUUSD",
)

get_new.insert(
    1,
    "timeframe",
    "1min",
)


columns = [
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

hist = hist[columns].copy()
get_new = get_new[columns].copy()


# ============================================================
# IMPORTANT:
# KEEP HISTDATA DATETIME UNCHANGED
# ============================================================

# HistData datetime hiện là timezone-naive.
# GetData datetime là UTC-aware.
#
# Ở bước merge file này chúng ta KHÔNG giả định HistData
# timezone. Vì hai tập không overlap sau GETDATA_START,
# chúng ta chỉ chuẩn hóa representation để có thể concatenate.

hist["datetime"] = hist["datetime"].dt.strftime(
    "%Y-%m-%d %H:%M:%S"
)

get_new["datetime"] = (
    get_new["datetime"]
    .dt.strftime(
        "%Y-%m-%d %H:%M:%S+00:00"
    )
)


# ============================================================
# CONCATENATE
# ============================================================

print()
print("=" * 70)
print("MERGING")
print("=" * 70)

final = pd.concat(
    [
        hist,
        get_new,
    ],
    ignore_index=True,
)

print(f"HistData rows : {len(hist):,}")
print(f"GetData rows  : {len(get_new):,}")
print(f"Final rows    : {len(final):,}")


# ============================================================
# FINAL OHLC VALIDATION
# ============================================================

invalid_final = final[
    (final["high"] < final["low"])
    | (final["high"] < final["open"])
    | (final["high"] < final["close"])
    | (final["low"] > final["open"])
    | (final["low"] > final["close"])
]

if not invalid_final.empty:
    raise RuntimeError(
        f"Final dataset contains "
        f"{len(invalid_final):,} invalid OHLC rows."
    )


# ============================================================
# WRITE OUTPUT
# ============================================================

print()
print("=" * 70)
print("WRITING OUTPUT")
print("=" * 70)

final.to_csv(
    OUTPUT_FILE,
    sep="\t",
    index=False,
    encoding="utf-8",
)

print(f"Output : {OUTPUT_FILE.resolve()}")


# ============================================================
# FINAL REPORT
# ============================================================

print()
print("=" * 70)
print("MERGE COMPLETE")
print("=" * 70)

print(f"Total rows      : {len(final):,}")
print(f"HistData rows   : {len(hist):,}")
print(f"GetData rows    : {len(get_new):,}")
print(f"Invalid OHLC    : {len(invalid_final):,}")

print()
print("Last HistData candles:")

print(
    hist.tail(5).to_string(
        index=False
    )
)

print()
print("First GetData candles:")

print(
    get_new.head(5).to_string(
        index=False
    )
)

print()
print("Last GetData candles:")

print(
    get_new.tail(5).to_string(
        index=False
    )
)
