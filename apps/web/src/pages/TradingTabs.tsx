import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Radio,
} from "lucide-react";

import { useMarketStreamStatus } from "../features/market/MarketStreamBridge";
import { getMarketFreshnessDisplayState } from "../features/market/marketFreshnessDisplayState";
import { getMarketPrice, type CandleInterval } from "../features/market/api";
import { useMarketCandles } from "../features/market/hooks/useMarketCandles";
import {
  isMarketClosedApiError,
  markMarketClosedConfirmed,
  shouldPauseMarketPolling,
} from "../features/market/market-hours";
import { XAUUSDChart } from "../features/market/components/XAUUSDChart";
import { TradingOrderPanel } from "../features/orders/components/TradingOrderPanel";
import { PositionsPanel } from "../features/positions/components/PositionsPanel";
import { OrdersPanel } from "../features/orders/components/OrdersPanel";
import { ClosedAverageChart } from "../features/market/components/ClosedAverageChart";

function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="app-page__heading">
      <p className="app-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

const CANDLE_INTERVALS: CandleInterval[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

export function MarketPage() {
  const [chartInterval, setChartInterval] = useState<CandleInterval>("1m");
  const [histogramInterval, setHistogramInterval] =
    useState<CandleInterval>("1m");
  const chartCandlesQuery = useMarketCandles({
    symbol: "XAUUSD",
    interval: chartInterval,
    limit: 10_000,
  });
  const histogramCandlesQuery = useMarketCandles({
    symbol: "XAUUSD",
    interval: histogramInterval,
    limit: 10_000,
  });
  const chartCandles =
    chartCandlesQuery.data?.interval === chartInterval
      ? chartCandlesQuery.data
      : undefined;
  const histogramCandles =
    histogramCandlesQuery.data?.interval === histogramInterval
      ? histogramCandlesQuery.data
      : undefined;
  const { connected, freshness } = useMarketStreamStatus();
  const marketClosed = shouldPauseMarketPolling();
  const marketQuery = useQuery({
    queryKey: ["market", "XAUUSD"],
    queryFn: async () => {
      if (marketClosed) {
        return await getMarketPrice("XAUUSD");
      }

      try {
        return await getMarketPrice("XAUUSD");
      } catch (error) {
        if (isMarketClosedApiError(error)) {
          markMarketClosedConfirmed();
        }
        throw error;
      }
    },
    refetchInterval: connected || marketClosed ? false : 5000,
    retry: false,
    placeholderData: undefined,
    initialData: undefined,
  });
  const market = marketQuery.data;

  const bid = market ? Number(market.bid) : null;
  const ask = market ? Number(market.ask) : null;
  const spread = bid !== null && ask !== null ? (ask - bid).toFixed(2) : "--";
  const marketStatus = marketClosed
    ? "CLOSED"
    : connected && freshness?.status === "FRESH"
      ? "LIVE"
      : market
        ? "DELAYED"
        : "WAITING";

  return (
    <div className="market-page">
      <header className="market-page__header">
        <div className="market-page__title">
          <div className="market-symbol-mark">
            <Activity size={18} />
          </div>
          <div>
            <p className="app-eyebrow">METALS / SPOT</p>
            <h1>XAU / USD</h1>
            <p>Gold spot price · United States Dollar</p>
          </div>
        </div>
        <div
          className={`market-live-status market-live-status--${marketStatus.toLowerCase()}`}
        >
          <span /> <Radio size={14} />{" "}
          {marketStatus === "CLOSED"
            ? "Thị trường đóng cửa"
            : marketStatus === "LIVE"
              ? "Live market"
              : marketStatus === "DELAYED"
                ? "Đang đồng bộ"
                : "Đang chờ dữ liệu"}
        </div>
      </header>

      <section className="market-quote-strip" aria-label="XAUUSD quote">
        <div className="market-last-price">
          <span>Last price</span>
          <strong>{market?.last ?? "--"}</strong>
          <small>
            <Clock3 size={13} />{" "}
            {market
              ? new Date(market.timestamp).toLocaleTimeString("vi-VN")
              : "Chưa có dữ liệu"}
          </small>
        </div>
        <div className="market-quote-value market-quote-value--bid">
          <span>Bid</span>
          <strong>{market?.bid ?? "--"}</strong>
          <small>
            <ArrowDownRight size={13} /> Sell price
          </small>
        </div>
        <div className="market-quote-value market-quote-value--ask">
          <span>Ask</span>
          <strong>{market?.ask ?? "--"}</strong>
          <small>
            <ArrowUpRight size={13} /> Buy price
          </small>
        </div>
        <div className="market-quote-stat">
          <span>Spread</span>
          <strong>{spread}</strong>
          <small>USD</small>
        </div>
        <div className="market-quote-stat">
          <span>Source</span>
          <strong>
            {market?.source === "twelve-data"
              ? "Twelve Data"
              : market?.source === "demo"
                ? "Demo"
                : "--"}
          </strong>
          <small>{market?.metadata.bidAskType ?? "Awaiting quote"}</small>
        </div>
      </section>

      <section className="market-chart-workspace">
        <div className="market-chart-toolbar">
          <div>
            <strong>Price chart</strong>
            <span>XAUUSD · Candlestick</span>
          </div>
          <div
            className="market-timeframes"
            role="group"
            aria-label="Khung thời gian biểu đồ"
          >
            {CANDLE_INTERVALS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={chartInterval === option}
                onClick={() => setChartInterval(option)}
                className={chartInterval === option ? "is-active" : ""}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <XAUUSDChart
          interval={chartInterval}
          candlesData={chartCandles}
          isLoading={
            chartCandlesQuery.isLoading ||
            (chartCandlesQuery.isFetching && !chartCandles)
          }
          isError={chartCandlesQuery.isError}
        />
      </section>

      <section>
        <ClosedAverageChart
          interval={histogramInterval}
          onIntervalChange={setHistogramInterval}
          candlesData={histogramCandles}
          isLoading={
            histogramCandlesQuery.isLoading ||
            (histogramCandlesQuery.isFetching && !histogramCandles)
          }
          isError={histogramCandlesQuery.isError}
        />
      </section>

      <section className="market-bottom-grid">
        <div className="market-insight">
          <div className="market-section-label">MARKET SNAPSHOT</div>
          <h2>Vàng đang được định giá ở đâu?</h2>
          <p>
            {marketClosed
              ? "Thị trường đang đóng cửa trong khung 00:00 thứ 7 đến 05:00 sáng thứ 2. Không thực hiện lấy dữ liệu thị trường trong khoảng thời gian này."
              : "Giá realtime, spread và độ mới dữ liệu được gom vào một không gian duy nhất để bạn quan sát trước khi giao dịch."}
          </p>
          <div className="market-insight__line">
            <span>Session</span>
            <strong>New York</strong>
            <span>Instrument</span>
            <strong>XAUUSD</strong>
          </div>
        </div>
        <div className="market-session">
          <div className="market-section-label">TRADING SESSIONS</div>
          <div className="session-row session-row--active">
            <span>New York</span>
            <small>Đang mở</small>
            <strong>13:00 — 22:00</strong>
          </div>
          <div className="session-row">
            <span>London</span>
            <small>Đã đóng</small>
            <strong>08:00 — 17:00</strong>
          </div>
          <div className="session-row">
            <span>Asia</span>
            <small>Sắp tới</small>
            <strong>00:00 — 09:00</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export function TradePage() {
  const { connected: marketStreamConnected, freshness: marketFreshness } =
    useMarketStreamStatus();

  const marketClosed = shouldPauseMarketPolling();
  const marketFreshnessDisplay = getMarketFreshnessDisplayState({
    connected: marketStreamConnected,
    freshness: marketFreshness,
  });
  const marketQuery = useQuery({
    queryKey: ["market", "XAUUSD"],
    queryFn: async () => {
      if (marketClosed) {
        return await getMarketPrice("XAUUSD");
      }

      try {
        return await getMarketPrice("XAUUSD");
      } catch (error) {
        if (isMarketClosedApiError(error)) {
          markMarketClosedConfirmed();
        }
        throw error;
      }
    },
    refetchInterval: marketStreamConnected || marketClosed ? false : 2000,
    retry: false,
    placeholderData: undefined,
    initialData: undefined,
  });

  const market = marketQuery.data;
  const canTrade = market?.metadata.executable === true;

  const marketStatus = marketClosed
    ? "offline"
    : marketQuery.isLoading
      ? "loading"
      : marketQuery.isError || !market || !canTrade
        ? "offline"
        : "online";

  return (
    <div className="app-page trade-page">
      <PageHeading
        eyebrow="ORDER ENTRY"
        title="Trade"
        description="Đặt lệnh bằng tài khoản demo."
      />

      <p
        className={`app-market-freshness app-market-freshness--${marketClosed ? "disconnected" : marketFreshnessDisplay.toLowerCase()}`}
        role="status"
        aria-label={`Market data status: ${marketClosed ? "THỊ TRƯỜNG ĐÓNG CỬA" : marketFreshnessDisplay}`}
      >
        Dữ liệu thị trường:{" "}
        {marketClosed
          ? "Thị trường đóng cửa"
          : marketFreshnessDisplay === "LIVE"
            ? "Đang mở"
            : marketFreshnessDisplay === "STALE"
              ? "Chậm"
              : marketFreshnessDisplay === "DISCONNECTED"
                ? "Mất kết nối"
                : "Đang chờ"}
      </p>
      {market && !canTrade && (
        <p role="status">
          Giá {market.source} chỉ dùng để tham khảo. Giao dịch đang bị vô hiệu
          hóa vì BID/ASK và timestamp nguồn chưa được xác minh.
        </p>
      )}
      <TradingOrderPanel
        symbol="XAUUSD"
        bid={canTrade && market ? Number(market.bid) : null}
        ask={canTrade && market ? Number(market.ask) : null}
        marketStatus={marketStatus}
      />
    </div>
  );
}

export function PositionsPage() {
  return (
    <div className="app-page positions-page">
      <PageHeading
        eyebrow="PORTFOLIO"
        title="Positions"
        description="Theo dõi và quản lý các vị thế đang mở."
      />
      <PositionsPanel />
    </div>
  );
}

export function HistoryPage() {
  return (
    <div className="app-page history-page">
      <PageHeading
        eyebrow="ACTIVITY"
        title="History"
        description="Theo dõi lịch sử lệnh giao dịch."
      />
      <OrdersPanel />
    </div>
  );
}
