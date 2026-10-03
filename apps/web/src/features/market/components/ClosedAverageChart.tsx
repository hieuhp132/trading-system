import { useMemo, useState } from "react";

import type { CandleInterval, MarketCandle, MarketCandles } from "../api";
import "./ClosedAverageChart.css";

type HistogramTime = {
  time: string;
  count: number;
  averagePerDay: number;
};

type HistogramDay = {
  day: string;
  count: number;
};

type HistogramBin = {
  from: number;
  to: number;
  count: number;
  averagePerDay: number;
  times: HistogramTime[];
  days: HistogramDay[];
};

const CANDLE_INTERVALS: CandleInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

const BIN_SIZE: Record<CandleInterval, number> = {
  "1m": 1,
  "5m": 2,
  "15m": 5,
  "1h": 10,
  "4h": 20,
  "1d": 25,
};

const EMPTY_CANDLES: MarketCandle[] = [];
const DAILY_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const INTRADAY_TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function resolveHistogramLimit(interval: CandleInterval) {
  switch (interval) {
    case "1m":
      return 500_000;
    case "5m":
      return 200_000;
    case "15m":
      return 100_000;
    case "1h":
      return 50_000;
    case "4h":
      return 20_000;
    case "1d":
      return 10_000;
  }
}

function getCandleDay(timestamp: number) {
  return new Date(timestamp * 1000)
    .toISOString()
    .slice(0, 10);
}

function getCandleTimeLabel(
  timestamp: number,
  interval: CandleInterval,
) {
  const date = new Date(timestamp * 1000);

  if (interval === "1d") {
    return DAILY_TIME_FORMATTER.format(date);
  }

  return INTRADAY_TIME_FORMATTER.format(date);
}

function calculateHistogram(
  candles: MarketCandle[],
  interval: CandleInterval,
  binSize: number,
): HistogramBin[] {
  if (candles.length === 0) {
    return [];
  }

  let minClose = Number.POSITIVE_INFINITY;
  let maxClose = Number.NEGATIVE_INFINITY;

  const days = new Set<string>();

  for (const candle of candles) {
    const close = Number(candle.close);

    if (!Number.isFinite(close)) {
      continue;
    }

    minClose = Math.min(minClose, close);
    maxClose = Math.max(maxClose, close);

    days.add(getCandleDay(candle.time));
  }

  if (
    !Number.isFinite(minClose) ||
    !Number.isFinite(maxClose)
  ) {
    return [];
  }

  const start =
    Math.floor(minClose / binSize) * binSize;

  const end =
    Math.floor(maxClose / binSize) * binSize +
    binSize;

  const numberOfBins = Math.ceil(
    (end - start) / binSize,
  );

  const counts = new Array<number>(
    numberOfBins,
  ).fill(0);

  const timeCounters = Array.from(
    { length: numberOfBins },
    () => new Map<string, number>(),
  );
  const dayCounters = Array.from(
    { length: numberOfBins },
    () => new Map<string, number>(),
  );

  for (const candle of candles) {
    const close = Number(candle.close);

    if (!Number.isFinite(close)) {
      continue;
    }

    let index = Math.floor(
      (close - start) / binSize,
    );

    index = Math.max(
      0,
      Math.min(index, numberOfBins - 1),
    );

    counts[index] += 1;

    const time = getCandleTimeLabel(
      candle.time,
      interval,
    );

    const counter = timeCounters[index];

    counter.set(
      time,
      (counter.get(time) ?? 0) + 1,
    );

    const day = getCandleDay(candle.time);
    const dayCounter = dayCounters[index];
    dayCounter.set(day, (dayCounter.get(day) ?? 0) + 1);
  }

  const numberOfDays = days.size;

  return counts.map((count, index) => {
    const from = start + index * binSize;
    const to = from + binSize;

    const times = Array.from(
      timeCounters[index].entries(),
    )
      .map(([time, timeCount]) => ({
        time,
        count: timeCount,
        averagePerDay:
          numberOfDays > 0
            ? timeCount / numberOfDays
            : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      from,
      to,
      count,
      averagePerDay:
        numberOfDays > 0
          ? count / numberOfDays
          : 0,
      times,
      days: Array.from(dayCounters[index].entries())
        .map(([day, dayCount]) => ({ day, count: dayCount }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    };
  });
}

interface ClosedAverageChartProps {
  interval: CandleInterval;
  onIntervalChange: (interval: CandleInterval) => void;
  candlesData: MarketCandles | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function ClosedAverageChart({
  interval,
  onIntervalChange,
  candlesData,
  isLoading,
  isError,
}: ClosedAverageChartProps) {
  const [selectedBin, setSelectedBin] =
    useState<HistogramBin | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const binSize = BIN_SIZE[interval];
  const availableDateRange = useMemo(() => {
    const sourceCandles = candlesData?.items ?? EMPTY_CANDLES;
    let from = "";
    let to = "";

    for (const candle of sourceCandles) {
      const day = getCandleDay(candle.time);
      if (!from || day < from) from = day;
      if (!to || day > to) to = day;
    }

    return { from, to };
  }, [candlesData]);

  const candles = useMemo(
    () => {
      const filteredCandles = (candlesData?.items ?? EMPTY_CANDLES).filter(
        (candle) => {
          const day = getCandleDay(candle.time);
          return (!startDate || day >= startDate) && (!endDate || day <= endDate);
        },
      );

      return filteredCandles.slice(-resolveHistogramLimit(interval));
    },
    [candlesData, endDate, interval, startDate],
  );

  const histogram = useMemo(
    () =>
      calculateHistogram(
        candles,
        interval,
        binSize,
      ),
    [candles, interval, binSize],
  );

  const numberOfDays = useMemo(() => {
    const days = new Set<string>();

    for (const candle of candles) {
      days.add(getCandleDay(candle.time));
    }

    return days.size;
  }, [candles]);

  const period = useMemo(() => {
    if (candles.length === 0) {
      return null;
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const candle of candles) {
      min = Math.min(min, candle.time);
      max = Math.max(max, candle.time);
    }

    return {
      from: new Date(
        min * 1000,
      ).toLocaleDateString("vi-VN"),

      to: new Date(
        max * 1000,
      ).toLocaleDateString("vi-VN"),
    };
  }, [candles]);

  const maxCount = useMemo(() => {
    let max = 0;

    for (const bin of histogram) {
      max = Math.max(max, bin.count);
    }

    return max;
  }, [histogram]);

  const highestFrequencyBin = useMemo(() => {
    if (!histogram.length) {
      return null;
    }

    return histogram.reduce((highest, bin) =>
      bin.count > highest.count
        ? bin
        : highest,
    );
  }, [histogram]);

  const yAxisTicks = [
    maxCount,
    Math.round(maxCount * 0.75),
    Math.round(maxCount * 0.5),
    Math.round(maxCount * 0.25),
    0,
  ];
  const selectedDayMaxCount = selectedBin?.days.reduce(
    (max, day) => Math.max(max, day.count),
    0,
  ) ?? 0;
  const selectedDayTicks = [
    selectedDayMaxCount,
    Math.round(selectedDayMaxCount / 2),
    0,
  ];
  const selectedDayLabelStep = Math.max(
    1,
    Math.ceil(((selectedBin?.days.length ?? 1) - 1) / 4),
  );

  if (isLoading && !candlesData) {
    return (
      <section className="close-histogram">
        <div className="close-histogram__loading">
          Đang tải dữ liệu histogram...
        </div>
      </section>
    );
  }

  if (isError && !candlesData) {
    return (
      <section className="close-histogram">
        <div className="close-histogram__error">
          Không thể tải dữ liệu candle.
        </div>
      </section>
    );
  }

  return (
    <section className="close-histogram">
      <header className="close-histogram__header">
        <div>
          <span className="close-histogram__eyebrow">
            MARKET DISTRIBUTION
          </span>

          <h2>Close Price Distribution</h2>

          <p>
            Tần suất giá đóng cửa của XAUUSD
            theo OHLC candle · UTC
          </p>
        </div>

        <div
          className="close-histogram__intervals"
          role="group"
          aria-label="Histogram timeframe"
        >
          {CANDLE_INTERVALS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={
                interval === option
              }
              className={
                interval === option
                  ? "is-active"
                  : ""
              }
              onClick={() => {
                onIntervalChange(option);
                setSelectedBin(null);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </header>

      <div className="close-histogram__filters">
        <label>
          <span>Từ ngày (UTC)</span>
          <input
            type="date"
            value={startDate}
            min={availableDateRange.from || undefined}
            max={availableDateRange.to || undefined}
            onChange={(event) => {
              setStartDate(event.target.value);
              setSelectedBin(null);
            }}
          />
        </label>
        <label>
          <span>Đến ngày (UTC)</span>
          <input
            type="date"
            value={endDate}
            min={availableDateRange.from || undefined}
            max={availableDateRange.to || undefined}
            onChange={(event) => {
              setEndDate(event.target.value);
              setSelectedBin(null);
            }}
          />
        </label>
        {(startDate || endDate) && (
          <button
            type="button"
            className="close-histogram__clear-filter"
            onClick={() => {
              setStartDate("");
              setEndDate("");
              setSelectedBin(null);
            }}
          >
            Xóa lọc
          </button>
        )}
      </div>

      <div className="close-histogram__stats">
        <div>
          <span>Timeframe</span>
          <strong>{interval}</strong>
        </div>

        <div>
          <span>Candles</span>
          <strong>
            {candles.length.toLocaleString()}
          </strong>
        </div>

        <div>
          <span>Trading days</span>
          <strong>{numberOfDays}</strong>
        </div>

        <div>
          <span>Price step</span>
          <strong>
            ${binSize.toFixed(2)}
          </strong>
        </div>

        <div>
          <span>Period</span>
          <strong>
            {period
              ? `${period.from} → ${period.to}`
              : "--"}
          </strong>
        </div>
      </div>

      {highestFrequencyBin && (
        <div className="close-histogram__peak">
          <div>
            <span>Highest frequency area</span>

            <strong>
              $
              {highestFrequencyBin.from.toFixed(
                2,
              )}
              {" — "}$
              {highestFrequencyBin.to.toFixed(
                2,
              )}
            </strong>
          </div>

          <div>
            <span>Total occurrences</span>
            <strong>
              {highestFrequencyBin.count.toLocaleString()}
            </strong>
          </div>

          <div>
            <span>Average / day</span>
            <strong>
              {highestFrequencyBin.averagePerDay.toFixed(
                2,
              )}
            </strong>
          </div>

          <div>
            <span>Most common time</span>
            <strong>
              {highestFrequencyBin.times[0]
                ?.time ?? "--"}
            </strong>
          </div>
        </div>
      )}

      <div className="close-histogram__chart-card">
        <div className="close-histogram__chart-title">
          <div>
            <strong>Frequency histogram</strong>
            <span>
              Close price range / number of candles
            </span>
          </div>

          <div className="close-histogram__legend">
            <span />
            Frequency
          </div>
        </div>

        <div className="close-histogram__chart">
          <div className="close-histogram__y-label">
            Frequency
          </div>

          <div className="close-histogram__y-ticks" aria-hidden="true">
            {yAxisTicks.map((tick, index) => (
              <span key={`${index}-${tick}`}>
                {tick.toLocaleString()}
              </span>
            ))}
          </div>

          <div className="close-histogram__plot">
            <div className="close-histogram__grid">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="close-histogram__bars">
              {histogram.map((bin) => {
                const height =
                  maxCount > 0
                    ? (bin.count /
                        maxCount) *
                      100
                    : 0;

                const selected =
                  selectedBin?.from ===
                  bin.from;

                return (
                  <button
                    key={bin.from}
                    type="button"
                    className={`close-histogram__bar ${
                      selected
                        ? "is-selected"
                        : ""
                    }`}
                    style={{
                      height: `${Math.max(
                        height,
                        bin.count > 0
                          ? 1
                          : 0,
                      )}%`,
                    }}
                    title={`$${bin.from.toFixed(
                      2,
                    )} — $${bin.to.toFixed(
                      2,
                    )}
Count: ${bin.count}
Average/day: ${bin.averagePerDay.toFixed(
                      2,
                    )}`}
                    onClick={() =>
                      setSelectedBin(bin)
                    }
                  >
                    <span className="close-histogram__bar-tooltip">
                      <strong>
                        $
                        {bin.from.toFixed(
                          2,
                        )}
                        {" — "}$
                        {bin.to.toFixed(
                          2,
                        )}
                      </strong>

                      <small>
                        Frequency: {bin.count.toLocaleString()} candles
                      </small>

                      <small>
                        Avg{" "}
                        {bin.averagePerDay.toFixed(
                          2,
                        )}
                        /day
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="close-histogram__x-label">
            Close price (USD)
          </div>
        </div>

        <div className="close-histogram__axis">
          {histogram.length > 0 && (
            <>
              <span>
                $
                {histogram[0].from.toFixed(
                  0,
                )}
              </span>

              <span>
                $
                {histogram[
                  Math.floor(
                    histogram.length / 4,
                  )
                ]?.from.toFixed(0)}
              </span>

              <span>
                $
                {histogram[
                  Math.floor(
                    histogram.length / 2,
                  )
                ]?.from.toFixed(0)}
              </span>

              <span>
                $
                {histogram[
                  Math.floor(
                    (histogram.length *
                      3) /
                      4,
                  )
                ]?.from.toFixed(0)}
              </span>

              <span>
                $
                {histogram[
                  histogram.length - 1
                ].to.toFixed(0)}
              </span>
            </>
          )}
        </div>
      </div>

      {selectedBin && (
        <div className="close-histogram__details">
          <div className="close-histogram__details-header">
            <div>
              <span>SELECTED PRICE RANGE</span>

              <h3>
                $
                {selectedBin.from.toFixed(
                  2,
                )}
                {" — "}$
                {selectedBin.to.toFixed(
                  2,
                )}
              </h3>
            </div>

            <button
              type="button"
              onClick={() =>
                setSelectedBin(null)
              }
            >
              ×
            </button>
          </div>

          <div className="close-histogram__details-stats">
            <div>
              <span>Occurrences</span>
              <strong>{selectedBin.count.toLocaleString()}</strong>
            </div>
            <div>
              <span>Average / day</span>
              <strong>{selectedBin.averagePerDay.toFixed(2)}</strong>
            </div>
            <div>
              <span>Most frequent time</span>
              <strong>{selectedBin.times[0]?.time ?? "--"}</strong>
            </div>
          </div>

          <div className="close-histogram__details-content">
            <div className="close-histogram__details-data">
              <div className="close-histogram__time-list">
                <div className="close-histogram__details-section-heading">
                  <strong>Phân bố theo giờ</strong>
                  <span>Top 10</span>
                </div>
                <div className="close-histogram__time-list-header">
                  <span>Close time</span>
                  <span>Count</span>
                  <span>Avg / day</span>
                </div>
                {selectedBin.times.slice(0, 10).map((time) => (
                  <div key={time.time} className="close-histogram__time-row">
                    <strong>{time.time}</strong>
                    <span>{time.count.toLocaleString()}</span>
                    <span>{time.averagePerDay.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="close-histogram__days-list">
                <div className="close-histogram__details-section-heading">
                  <strong>Ngày có giá trong vùng (UTC)</strong>
                  <span>{selectedBin.days.length} ngày</span>
                </div>
                <div className="close-histogram__days-list-header">
                  <span>Ngày</span>
                  <span>Số candle</span>
                </div>
                {selectedBin.days.map((day) => (
                  <div key={day.day} className="close-histogram__day-row">
                    <time dateTime={day.day}>{day.day}</time>
                    <strong>{day.count.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="close-histogram__daily-chart">
              <div className="close-histogram__daily-chart-heading">
                <div>
                  <strong>Occurrences theo ngày</strong>
                  <span>Số candle đóng cửa trong vùng giá</span>
                </div>
                <span className="close-histogram__daily-chart-unit">Candle</span>
              </div>
              <div className="close-histogram__daily-chart-body">
                <div className="close-histogram__daily-y-ticks" aria-hidden="true">
                  {selectedDayTicks.map((tick, index) => (
                    <span key={`${index}-${tick}`}>{tick.toLocaleString()}</span>
                  ))}
                </div>
                <div className="close-histogram__daily-plot">
                  <div className="close-histogram__daily-grid" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="close-histogram__daily-bars">
                    {selectedBin.days.map((day) => (
                      <button
                        key={day.day}
                        type="button"
                        className="close-histogram__daily-bar"
                        style={{
                          height: `${Math.max(
                            (day.count / selectedDayMaxCount) * 100,
                            2,
                          )}%`,
                        }}
                        title={`${day.day} · ${day.count.toLocaleString()} candle`}
                        aria-label={`${day.day}: ${day.count.toLocaleString()} candle`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="close-histogram__daily-x-axis">
                {selectedBin.days.map((day, index) => {
                  const showLabel =
                    index === 0 ||
                    index === selectedBin.days.length - 1 ||
                    index % selectedDayLabelStep === 0;

                  return (
                    <span key={day.day}>
                      {showLabel ? day.day.slice(5) : ""}
                    </span>
                  );
                })}
              </div>
              <p className="close-histogram__daily-chart-note">
                Ngày UTC · rê chuột lên cột để xem số lượng chính xác
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}