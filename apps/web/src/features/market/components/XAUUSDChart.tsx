import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,

} from "lightweight-charts";

import { useMarketCandles } from "../hooks/useMarketCandles";
import { getCandleDisplayState } from "../candleDisplayState";
import { getCandleFreshness } from "../candleFreshness";
import { syncCandlesToChart } from "../syncCandlesToChart";

interface XAUUSDChartProps {
  interval?: "1m" | "5m" | "15m" | "1h";
}

export function XAUUSDChart({ interval = "1m" }: XAUUSDChartProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const fittedIntervalRef = useRef<string | null>(null);

  const candlesQuery = useMarketCandles({
    symbol: "XAUUSD",
    interval,
    limit: 100,
  });

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
          color: "#ffffff",
        },

        textColor: "#64748b",
      },

      grid: {
        vertLines: {
          color: "#f1f5f9",
        },

        horzLines: {
          color: "#f1f5f9",
        },
      },

      rightPriceScale: {
        borderColor: "#e2e8f0",
      },

      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
      },

      crosshair: {
        vertLine: {
          color: "#94a3b8",
        },

        horzLine: {
          color: "#94a3b8",
        },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
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

  const source = candlesQuery.data?.source;

  const displayState = getCandleDisplayState({
    data: candlesQuery.data,
    isLoading: candlesQuery.isLoading,
    isError: candlesQuery.isError,
  });
  useEffect(() => {
    const series = seriesRef.current;

    if (!series) {
      return;
    }

    const result = syncCandlesToChart({
      series,
      chart: chartRef.current,
      data: candlesQuery.data,
      interval,
      shouldClearChart: displayState.shouldClearChart,
      fittedInterval: fittedIntervalRef.current,
    });

    fittedIntervalRef.current = result.fittedInterval;
  }, [
    candlesQuery.data,
    displayState.shouldClearChart,
    interval,
  ]);



  const metadata = candlesQuery.data?.metadata;

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

  const backendReceivedAt = formatTimestamp(metadata?.receivedAt);

  const frontendUpdatedAt =
    candlesQuery.dataUpdatedAt > 0
      ? formatTimestamp(candlesQuery.dataUpdatedAt)
      : null;

  const latestCandleAt =
    metadata?.latestCandleTime !== null &&
    metadata?.latestCandleTime !== undefined
      ? formatTimestamp(metadata.latestCandleTime * 1000)
      : null;

  const sourceTimestamp = formatTimestamp(metadata?.sourceTimestamp);

  return (
    <section className="dashboard-panel market-chart-panel">
      <div className="panel-header">
        <div>
          <div className="panel-title-row">
            <h2>XAUUSD Chart</h2>

            {candlesQuery.isFetching && (
              <span className="market-chart-loading">Updating...</span>
            )}
          </div>

          <p>Candlestick · {interval}</p>

          <p role="status">
            Nguồn dữ liệu:{" "}
            {source === "demo"
              ? "DEMO — dữ liệu mô phỏng"
              : source === "twelve-data"
                ? "TWELVE DATA — dữ liệu tham khảo"
                : "Chưa xác định"}
          </p>

          <p>
            Backend nhận dữ liệu:{" "}
            {backendReceivedAt ?? "Chưa có metadata từ API"}
          </p>

          <p>
            Frontend cập nhật cache:{" "}
            {frontendUpdatedAt ?? "Chưa có dữ liệu"}
            {" "}(theo đồng hồ thiết bị)
          </p>

          <p>
            Nến mới nhất bắt đầu:{" "}
            {latestCandleAt ?? "Chưa xác định"}
          </p>

          <p>
            Timestamp nguồn:{" "}
            {sourceTimestamp ?? "Chưa xác minh"}
          </p>

          <p role="status">
            Trạng thái khung nến: {bucketLabel}
          </p>

          <p>
            Độ mới dữ liệu thị trường: Chưa xác minh
          </p>

          {candlesQuery.isFetching && candlesQuery.data && (
            <p>Đang kiểm tra dữ liệu mới...</p>
          )}
        </div>
      </div>

      {displayState.status === "empty" && (
        <div className="trading-order-panel__error" role="alert">
          API không trả về nến hợp lệ. Không thể hiển thị dữ liệu biểu đồ.
        </div>
      )}

      {candlesQuery.isLoading && (
        <div className="market-chart-placeholder">Đang tải chart...</div>
      )}

      {(displayState.status === "error" ||
        displayState.status === "stale") && (
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
