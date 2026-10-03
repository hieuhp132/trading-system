from pathlib import Path
import pandas as pd


HISTDATA_FILE = Path("XAUUSD_M1_2009_2026.txt")
GETDATA_FILE = Path("getdata/XAUUSD_1m.csv")


# ============================================================
# LOAD
# ============================================================

hist = pd.read_csv(
    HISTDATA_FILE,
    sep="\t",
    usecols=["datetime", "close"],
)

get = pd.read_csv(
    GETDATA_FILE,
    usecols=["datetime", "close"],
)

hist["datetime"] = pd.to_datetime(
    hist["datetime"],
    errors="coerce",
)

get["datetime"] = pd.to_datetime(
    get["datetime"],
    utc=True,
    errors="coerce",
)

hist = hist.dropna()
get = get.dropna()

# GetData -> naive UTC chỉ để comparison
get["datetime"] = (
    get["datetime"]
    .dt.tz_convert("UTC")
    .dt.tz_localize(None)
)

hist = hist[
    hist["datetime"].dt.year == 2026
].copy()


# ============================================================
# TEST EACH MONTH
# ============================================================

print("=" * 90)
print("HISTDATA -> UTC OFFSET DETECTION")
print("=" * 90)

results = []

# GetData bắt đầu từ tháng 3
for month in range(3, 10):

    hist_month = hist[
        hist["datetime"].dt.month == month
    ].copy()

    get_month = get[
        get["datetime"].dt.month == month
    ].copy()

    if hist_month.empty or get_month.empty:
        continue

    candidates = []

    # Các offset hợp lý để test
    for offset in range(-6, 7):

        shifted = hist_month.copy()

        shifted["datetime"] = (
            shifted["datetime"]
            + pd.Timedelta(hours=offset)
        )

        merged = shifted.merge(
            get_month,
            on="datetime",
            suffixes=("_hist", "_get"),
        )

        if merged.empty:
            continue

        diff = (
            merged["close_hist"]
            - merged["close_get"]
        ).abs()

        candidates.append(
            {
                "month": month,
                "offset": offset,
                "matches": len(merged),
                "mean_diff": diff.mean(),
                "median_diff": diff.median(),
                "p95_diff": diff.quantile(0.95),
            }
        )

    candidate_df = pd.DataFrame(candidates)

    best = candidate_df.sort_values(
        ["median_diff", "mean_diff"]
    ).iloc[0]

    results.append(best)


# ============================================================
# REPORT
# ============================================================

result_df = pd.DataFrame(results)

result_df["month"] = (
    result_df["month"]
    .astype(int)
)

result_df["offset"] = (
    result_df["offset"]
    .astype(int)
)

result_df["matches"] = (
    result_df["matches"]
    .astype(int)
)

print()
print(
    result_df.to_string(
        index=False,
        formatters={
            "mean_diff": lambda x: f"{x:.4f}",
            "median_diff": lambda x: f"{x:.4f}",
            "p95_diff": lambda x: f"{x:.4f}",
        },
    )
)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 90)
print("SUMMARY")
print("=" * 90)

for _, row in result_df.iterrows():

    print(
        f"2026-{int(row['month']):02d}: "
        f"HistData + {int(row['offset']):+d}h "
        f"-> UTC | "
        f"matches={int(row['matches']):,} | "
        f"median diff=${row['median_diff']:.4f}"
    )