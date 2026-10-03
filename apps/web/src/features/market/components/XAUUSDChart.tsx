import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

import type { MarketCandles } from "../api";
import { getCandleDisplayState } from "../candleDisplayState";
import { getCandleFreshness } from "../candleFreshness";
import { syncCandlesToChart } from "../syncCandlesToChart";
import { shouldPauseMarketPolling } from "../market-hours";
import { useMarketStreamStatus } from "../MarketStreamBridge";

interface XAUUSDChartProps {
  interval?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
  candlesData: MarketCandles | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function XAUUSDChart({
  interval = "1m",
  candlesData,
  isLoading,
  isError,
}: XAUUSDChartProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const streamStatus = useMarketStreamStatus();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 420,

      layout: {
        background: {
          type: ColorType.Solid,
          color: "#151d2d",
        },

        textColor: "#8794aa",
        attributionLogo: false,
      },

      grid: {
        vertLines: {
          color: "rgba(135, 148, 170, 0.11)",
        },

        horzLines: {
          color: "rgba(135, 148, 170, 0.11)",
        },
      },

      rightPriceScale: {
        borderColor: "rgba(135, 148, 170, 0.18)",
      },

      timeScale: {
        borderColor: "rgba(135, 148, 170, 0.18)",
        timeVisible: true,
        secondsVisible: false,
      },

      crosshair: {
        vertLine: {
          color: "rgba(214, 173, 96, 0.62)",
        },

        horzLine: {
          color: "rgba(214, 173, 96, 0.62)",
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#3db982",
      downColor: "#d46d78",
      borderUpColor: "#3db982",
      borderDownColor: "#d46d78",
      wickUpColor: "#3db982",
      wickDownColor: "#d46d78",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) {
        return;
      }

      chart.applyOptions({
        width: containerRef.current.clientWidth,
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();

      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const source = candlesData?.source;
  const marketClosed = shouldPauseMarketPolling();

  const displayState = getCandleDisplayState({
    data: candlesData,
    isLoading,
    isError,
    marketClosed,
  });
  useEffect(() => {
    const series = seriesRef.current;

    if (!series) {
      return;
    }

    syncCandlesToChart({
      series,
      chart: chartRef.current,
      data: candlesData,
      interval,
      shouldClearChart: displayState.shouldClearChart,
      fittedInterval: null,
      lastAppliedLatestTime: null,
      skipFitContent: true,
    });

  }, [candlesData, displayState.shouldClearChart, interval]);

  const metadata = candlesData?.metadata;

  const freshness = getCandleFreshness({
    interval,
    latestCandleTime: metadata?.latestCandleTime,
    sourceTimestamp: metadata?.sourceTimestamp,
    nowMs,
  });

  const bucketLabel = {
    CURRENT_BUCKET: "Nến thuộc khung thời gian hiện tại",
    DELAYED_BUCKET: "Nến mới nhất thuộc khung thời gian trước",
    FUTURE_BUCKET: "Timestamp nến nằm trong tương lai",
    UNKNOWN: "Chưa xác định",
  }[freshness.status];

  const formatTimestamp = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) {
      return null;
    }

    const date = new Date(value);

    return Number.isFinite(date.getTime())
      ? date.toLocaleString("vi-VN")
      : null;
  };

  const latestCandleAt =
    metadata?.latestCandleTime !== null &&
    metadata?.latestCandleTime !== undefined
      ? formatTimestamp(metadata.latestCandleTime * 1000)
      : null;

  const isInitialLoading = isLoading && !candlesData;

  const statusText = useMemo(() => {
    if (marketClosed) {
      return "Đóng cửa cuối tuần";
    }

    if (isInitialLoading) {
      return "Loading...";
    }

    if (streamStatus.connected && freshness.status === "CURRENT_BUCKET") {
      return latestCandleAt ? `Live · ${latestCandleAt}` : "Live";
    }

    if (latestCandleAt) {
      return `Updated ${latestCandleAt}`;
    }

    return "Waiting for candles";
  }, [
    marketClosed,
    isInitialLoading,
    streamStatus.connected,
    freshness.status,
    latestCandleAt,
  ]);

  return (
    <section className="market-chart-panel">
      <div className="panel-header">
        <div>
          <div className="panel-title-row">
            <h2>XAUUSD Chart</h2>

            {isInitialLoading && (
              <span className="market-chart-loading">Updating...</span>
            )}
          </div>

          <p>
            Candlestick · {interval} ·{" "}
            {source === "twelve-data"
              ? "Twelve Data"
              : source === "demo"
                ? "Demo"
                : source === "historical-full" || source === "GETDATA"
                  ? "Historical database"
                  : "Awaiting source"}
          </p>
        </div>
        <div className="market-chart-panel__status" title={bucketLabel}>
          <span className="market-chart-panel__status-dot" />
          {statusText}
        </div>
      </div>

      {displayState.status === "empty" && (
        <div className="trading-order-panel__error" role="alert">
          API không trả về nến hợp lệ. Không thể hiển thị dữ liệu biểu đồ.
        </div>
      )}

      {(displayState.status === "error" || displayState.status === "stale") && (
        <div className="trading-order-panel__error" role="alert">
          Không thể cập nhật dữ liệu biểu đồ.
          {displayState.shouldShowStaleWarning
            ? " Dữ liệu đang hiển thị có thể đã cũ."
            : " Chưa có dữ liệu hợp lệ để hiển thị."}
        </div>
      )}

      <div ref={containerRef} className="xauusd-chart" />
    </section>
  );
}
