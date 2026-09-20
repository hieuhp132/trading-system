import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";

import { useMarketCandles } from "../hooks/useMarketCandles";

interface XAUUSDChartProps {
  interval?: "1m" | "5m" | "15m" | "1h";
}

export function XAUUSDChart({ interval = "1m" }: XAUUSDChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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

  useEffect(() => {
    const series = seriesRef.current;

    const items = candlesQuery.data?.items;

    if (!series || !items) {
      return;
    }

    const data: CandlestickData<Time>[] = items.map((candle) => ({
      time: candle.time as Time,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }));

    series.setData(data);

    chartRef.current?.timeScale().fitContent();
  }, [candlesQuery.data]);

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
        </div>
      </div>

      {candlesQuery.isLoading && (
        <div className="market-chart-placeholder">Đang tải chart...</div>
      )}

      {candlesQuery.isError && (
        <div className="trading-order-panel__error">
          Không thể tải dữ liệu chart.
        </div>
      )}

      <div ref={containerRef} className="xauusd-chart" />
    </section>
  );
}
