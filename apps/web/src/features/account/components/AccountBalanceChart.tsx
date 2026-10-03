import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

import type { AccountBalanceHistory } from "../api";

const RANGE_SECONDS = {
  "1m": 60,
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
  "1M": 30 * 24 * 60 * 60,
  "3M": 90 * 24 * 60 * 60,
  "6M": 180 * 24 * 60 * 60,
  "1y": 365 * 24 * 60 * 60,
  All: Number.POSITIVE_INFINITY,
} as const;

type RangeOption = keyof typeof RANGE_SECONDS;

function getRangeStart(endTime: number, range: RangeOption): number {
  if (range === "All") {
    return 0;
  }

  if (range === "1y") {
    const endDate = new Date(endTime * 1000);
    return Date.UTC(
      endDate.getUTCFullYear() - 1,
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
      endDate.getUTCHours(),
      endDate.getUTCMinutes(),
      endDate.getUTCSeconds(),
    ) / 1000;
  }

  return endTime - RANGE_SECONDS[range];
}

export function AccountBalanceChart({
  history,
  isLoading,
  currency,
  title = "Account value",
  metric = "balance",
  accentColor = "#56d596",
  ariaLabel = "Account balance history",
}: {
  history: AccountBalanceHistory | undefined;
  isLoading: boolean;
  currency: string;
  title?: string;
  metric?: "balance" | "equity";
  accentColor?: string;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [range, setRange] = useState<RangeOption>("1h");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8794aa",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(135,148,170,0.12)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        rightOffset: 3,
      },
      crosshair: {
        vertLine: { color: "rgba(214,173,96,0.45)" },
        horzLine: { color: "rgba(214,173,96,0.45)" },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: accentColor,
      topColor: `${accentColor}40`,
      bottomColor: `${accentColor}0d`,
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: accentColor,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [accentColor]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !history) return;

    const sortedPoints = [...history.points].sort(
      (a, b) => Number(a.time) - Number(b.time),
    );
    const allPoints = sortedPoints.map((point) => ({
      time: point.time as UTCTimestamp,
      value: Number(metric === "equity" ? point.equity : point.balance),
    }));
    const endTime = allPoints.at(-1)?.time;
    if (endTime === undefined) {
      series.setData([]);
      return;
    }

    const startTime = getRangeStart(Number(endTime), range);
    const visiblePoints = allPoints.filter(
      (point) => Number(point.time) >= startTime,
    );
    const data = visiblePoints.length > 0
      ? visiblePoints
      : allPoints.slice(-1);

    series.setData(data);
    chart.timeScale().fitContent();
  }, [history, metric, range]);

  const lastPoint = history?.points.at(-1);
  const rangePoints = lastPoint
    ? history?.points.filter(
        (point) => point.time >= getRangeStart(lastPoint.time, range),
      ) ?? []
    : [];
  const firstPoint = rangePoints[0];
  const latest = rangePoints.at(-1);
  const change = latest && firstPoint
    ? Number(metric === "equity" ? latest.equity : latest.balance) - Number(metric === "equity" ? firstPoint.equity : firstPoint.balance)
    : 0;
  const changeLabel = `${change >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(change)} ${currency}`;

  const label = metric === "equity" ? "EQUITY HISTORY" : "BALANCE HISTORY";

  return (
    <section className="account-balance-history" aria-label={ariaLabel}>
      <div className="account-balance-history__header">
        <div>
          <p className="app-eyebrow">{label}</p>
          <h2>{title}</h2>
          {latest && (
            <span className={change >= 0 ? "app-profit" : "app-loss"}>
              {changeLabel} in selected range
            </span>
          )}
        </div>
        <div className="account-balance-history__ranges" role="group" aria-label={`${title} chart range`}>
          {(Object.keys(RANGE_SECONDS) as RangeOption[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              className={range === option ? "is-active" : ""}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <p className="account-balance-history__message">Loading {metric} history…</p>}
      {!isLoading && (!history || history.points.length < 2) && (
        <p className="account-balance-history__message">Chưa có đủ dữ liệu để hiển thị lịch sử {metric}.</p>
      )}
      <div ref={containerRef} className="account-balance-history__chart" />
    </section>
  );
}
