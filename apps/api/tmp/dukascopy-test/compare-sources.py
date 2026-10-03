from pathlib import Path
import pandas as pd

HISTDATA_FILE = Path("XAUUSD_M1_2009_2026.txt")
GETDATA_FILE = Path("getdata/XAUUSD_1m.csv")

# ============================================================
# LOAD HISTDATA
# ============================================================

hist = pd.read_csv(
    HISTDATA_FILE,
    sep="\t",
)

hist["datetime"] = pd.to_datetime(
    hist["datetime"],
    errors="coerce",
)

hist = hist.dropna(subset=["datetime"])

print("=" * 70)
print("HISTDATA")
print("=" * 70)

print("Rows :", f"{len(hist):,}")
print("First:", hist["datetime"].min())
print("Last :", hist["datetime"].max())


# ============================================================
# LOAD GETDATA
# ============================================================

get = pd.read_csv(GETDATA_FILE)

get["datetime"] = pd.to_datetime(
    get["datetime"],
    utc=True,
    errors="coerce",
)

get = get.dropna(subset=["datetime"])

# Remove timezone temporarily so timestamps can be compared.
get["datetime"] = get["datetime"].dt.tz_localize(None)

print()
print("=" * 70)
print("GETDATA")
print("=" * 70)

print("Rows :", f"{len(get):,}")
print("First:", get["datetime"].min())
print("Last :", get["datetime"].max())


# ============================================================
# TEST DIFFERENT TIME OFFSETS
# ============================================================

print()
print("=" * 70)
print("TESTING TIME OFFSETS")
print("=" * 70)

# HistData may not use UTC.
# Try offsets from -12h to +12h.
results = []

for offset in range(-12, 13):

    h = hist[
        ["datetime", "open", "high", "low", "close"]
    ].copy()

    h["datetime"] = h["datetime"] + pd.Timedelta(hours=offset)

    merged = h.merge(
        get[
            ["datetime", "open", "high", "low", "close"]
        ],
        on="datetime",
        suffixes=("_hist", "_get"),
    )

    if merged.empty:
        continue

    # Average absolute CLOSE difference
    close_diff = (
        merged["close_hist"] -
        merged["close_get"]
    ).abs()

    results.append(
        {
            "offset": offset,
            "matches": len(merged),
            "mean_diff": close_diff.mean(),
            "median_diff": close_diff.median(),
            "max_diff": close_diff.max(),
        }
    )


results_df = pd.DataFrame(results)

results_df = results_df.sort_values(
    "mean_diff"
)

print(results_df.to_string(index=False))


# ============================================================
# BEST OFFSET
# ============================================================

best = results_df.iloc[0]

best_offset = int(best["offset"])

print()
print("=" * 70)
print("BEST OFFSET")
print("=" * 70)

print(
    f"HistData datetime + {best_offset} hours "
    f"best matches GetData"
)

print(
    "Mean close difference:",
    round(best["mean_diff"], 6),
)

print(
    "Median close difference:",
    round(best["median_diff"], 6),
)


# ============================================================
# COMPARE 18 SEPTEMBER
# ============================================================

hist_compare = hist.copy()

hist_compare["datetime"] = (
    hist_compare["datetime"]
    + pd.Timedelta(hours=best_offset)
)

start = pd.Timestamp("2026-09-18 00:00:00")
end = pd.Timestamp("2026-09-19 00:00:00")

hist_day = hist_compare[
    (hist_compare["datetime"] >= start)
    & (hist_compare["datetime"] < end)
]

get_day = get[
    (get["datetime"] >= start)
    & (get["datetime"] < end)
]

comparison = hist_day.merge(
    get_day,
    on="datetime",
    suffixes=("_hist", "_get"),
)

comparison["close_diff"] = (
    comparison["close_hist"]
    - comparison["close_get"]
).abs()

print()
print("=" * 70)
print("18 SEPTEMBER COMPARISON")
print("=" * 70)

print("HistData candles :", len(hist_day))
print("GetData candles  :", len(get_day))
print("Matched candles  :", len(comparison))

if not comparison.empty:

    print(
        "Mean close diff  :",
        comparison["close_diff"].mean(),
    )

    print(
        "Median close diff:",
        comparison["close_diff"].median(),
    )

    print(
        "Max close diff   :",
        comparison["close_diff"].max(),
    )

    print()
    print("Sample:")

    print(
        comparison[
            [
                "datetime",
                "close_hist",
                "close_get",
                "close_diff",
            ]
        ]
        .head(20)
        .to_string(index=False)
    )