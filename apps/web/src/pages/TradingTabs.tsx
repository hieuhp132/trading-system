import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useMarketStreamStatus } from "../features/market/MarketStreamBridge";
import { getMarketFreshnessDisplayState } from "../features/market/marketFreshnessDisplayState";
import { getMarketPrice, type CandleInterval } from "../features/market/api";
import { XAUUSDChart } from "../features/market/components/XAUUSDChart";
import { TradingOrderPanel } from "../features/orders/components/TradingOrderPanel";
import { PositionsPanel } from "../features/positions/components/PositionsPanel";
import { OrdersPanel } from "../features/orders/components/OrdersPanel";

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

const CANDLE_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h"];

export function MarketPage() {
  const [interval, setInterval] = useState<CandleInterval>("1m");

  return (
    <div className="app-page">
      <PageHeading
        eyebrow="XAUUSD"
        title="Market"
        description="Biểu đồ và diễn biến giá vàng."
      />

      <section className="app-surface">
        <div
          role="group"
          aria-label="Khung thời gian biểu đồ"
          style={{
            display: "flex",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: "8px",
            marginBottom: "16px",
          }}
        >
          {CANDLE_INTERVALS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={interval === option}
              onClick={() => setInterval(option)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border:
                  interval === option
                    ? "1px solid #e9bd69"
                    : "1px solid #475569",
                background:
                  interval === option ? "#e9bd69" : "#1e293b",
                color:
                  interval === option ? "#172033" : "#e2e8f0",
                fontWeight: interval === option ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <XAUUSDChart interval={interval} />
      </section>
    </div>
  );
}

export function TradePage() {
  const {
    connected: marketStreamConnected,
    freshness: marketFreshness,
  } = useMarketStreamStatus();

  const marketFreshnessDisplay =
    getMarketFreshnessDisplayState({
      connected: marketStreamConnected,
      freshness: marketFreshness,
    });
  const marketQuery = useQuery({
    queryKey: ["market", "XAUUSD"],
    queryFn: () => getMarketPrice("XAUUSD"),
    refetchInterval: marketStreamConnected ? false : 2000,
  });

  const market = marketQuery.data;
  const canTrade = market?.metadata.executable === true;

  const marketStatus = marketQuery.isLoading
    ? "loading"
    : marketQuery.isError || !market || !canTrade
      ? "offline"
      : "online";

  return (
    <div className="app-page">
      <PageHeading
        eyebrow="ORDER ENTRY"
        title="Trade"
        description="Đặt lệnh bằng tài khoản demo."
      />

      <p
        className={`app-market-freshness app-market-freshness--${marketFreshnessDisplay.toLowerCase()}`}
        role="status"
        aria-label={`Market data status: ${marketFreshnessDisplay}`}
      >
        Market data:{" "}
        {marketFreshnessDisplay === "LIVE"
          ? "Live"
          : marketFreshnessDisplay === "STALE"
            ? "Stale"
            : marketFreshnessDisplay === "DISCONNECTED"
              ? "Disconnected"
              : "Waiting"}
      </p>
      {market && !canTrade && (
        <p role="status">
          Giá {market.source} chỉ dùng để tham khảo.
          Giao dịch đang bị vô hiệu hóa vì BID/ASK và timestamp nguồn
          chưa được xác minh.
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
    <div className="app-page">
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
    <div className="app-page">
      <PageHeading
        eyebrow="ACTIVITY"
        title="History"
        description="Theo dõi lịch sử lệnh giao dịch."
      />
      <OrdersPanel />
    </div>
  );
}
