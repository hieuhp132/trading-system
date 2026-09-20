import { Activity, BarChart3, RefreshCw, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getAccountBalance } from "../features/account/api";
import { getMarketPrice } from "../features/market/api";
import { useAuthStore } from "../stores/auth";

import { TradingOrderPanel } from "../features/orders/components/TradingOrderPanel";
import { PositionsPanel } from "../features/positions/components/PositionsPanel.tsx";
import { OrdersPanel } from "../features/orders/components/OrdersPanel.tsx";
import { XAUUSDChart } from "../features/market/components/XAUUSDChart.tsx";

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
function getPnlClass(value: string | number) {
  const pnl = Number(value);

  if (pnl > 0) {
    return "pnl-positive";
  }

  if (pnl < 0) {
    return "pnl-negative";
  }

  return "pnl-neutral";
}
function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString();
}

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const accountQuery = useQuery({
    queryKey: ["account", "balance"],
    queryFn: getAccountBalance,
    refetchInterval: 5000,
  });

  const marketQuery = useQuery({
    queryKey: ["market", "XAUUSD"],
    queryFn: () => getMarketPrice("XAUUSD"),
    refetchInterval: 2000,
  });

  const account = accountQuery.data;
  const market = marketQuery.data;

  const marketStatus = marketQuery.isLoading
    ? "loading"
    : marketQuery.isError
      ? "offline"
      : market
        ? "online"
        : "offline";

  return (
    <div className="dashboard-page">
      {/* =========================
          PAGE HEADER
          ========================= */}

      <div className="page-header">
        <div>
          <p className="page-eyebrow">PAPER TRADING</p>

          <h1>Trading Dashboard</h1>

          <p className="page-description">
            Xin chào, <strong>{user?.fullname ?? user?.email}</strong>. Đây là
            khu vực giao dịch demo XAUUSD.
          </p>
        </div>

        <div className="market-status">
          <span
            className={`status-dot ${
              marketQuery.isError ? "status-dot-error" : ""
            }`}
          />

          {marketQuery.isLoading
            ? "Connecting..."
            : marketQuery.isError
              ? "Market Offline"
              : "Market Online"}
        </div>
      </div>

      {/* =========================
          ACCOUNT SUMMARY
          ========================= */}

      <section className="dashboard-grid">
        <article className="dashboard-card">
          <div className="card-icon">
            <Wallet size={20} />
          </div>

          <div>
            <span>Balance</span>

            <strong>
              {account ? `$${formatMoney(account.balance)}` : "--"}
            </strong>
          </div>
        </article>

        <article className="dashboard-card">
          <div className="card-icon">
            <BarChart3 size={20} />
          </div>

          <div>
            <span>Equity</span>

            <strong>
              {account ? `$${formatMoney(account.equity)}` : "--"}
            </strong>
          </div>
        </article>

        <article className="dashboard-card">
          <div className="card-icon">
            <Activity size={20} />
          </div>

          <div>
            <span>Unrealized P&amp;L</span>

            <strong
              className={
                account ? getPnlClass(account.unrealizedPnl) : "pnl-neutral"
              }
            >
              {account ? `$${formatMoney(account.unrealizedPnl)}` : "--"}
            </strong>
          </div>
        </article>
      </section>

      {/* =========================
          MARKET QUOTE
          ========================= */}

      <section className="dashboard-panel market-panel">
        <div className="panel-header">
          <div>
            <div className="panel-title-row">
              <h2>XAUUSD</h2>

              {marketQuery.isFetching && (
                <RefreshCw size={15} className="spin" />
              )}
            </div>

            <p>Gold / US Dollar · {market?.source ?? "demo"}</p>
          </div>

          {market && (
            <span className="market-time">
              Updated {formatTime(market.timestamp)}
            </span>
          )}
        </div>

        <div className="quote-grid">
          <div className="quote-card">
            <span>BID</span>

            <strong>{market ? formatMoney(market.bid) : "--"}</strong>

            <small>SELL execution</small>
          </div>

          <div className="quote-card">
            <span>ASK</span>

            <strong>{market ? formatMoney(market.ask) : "--"}</strong>

            <small>BUY execution</small>
          </div>

          <div className="quote-card">
            <span>LAST</span>

            <strong>{market ? formatMoney(market.last) : "--"}</strong>

            <small>Reference price</small>
          </div>

          <div className="quote-card">
            <span>SPREAD</span>

            <strong>
              {market
                ? formatMoney(Number(market.ask) - Number(market.bid))
                : "--"}
            </strong>

            <small>Ask − Bid</small>
          </div>
        </div>
      </section>

      {/* =========================
          TRADING WORKSPACE
          ========================= */}

      <section className="dashboard-panel trading-workspace">
        <div className="panel-header">
          <div>
            <h2>Trading Workspace</h2>

            <p>
              Theo dõi giá XAUUSD và thực hiện MARKET order bằng tài khoản demo.
            </p>
          </div>
        </div>

        <XAUUSDChart interval="1m" />

        <div className="trading-panel">
          <TradingOrderPanel
            symbol="XAUUSD"
            bid={market ? Number(market.bid) : null}
            ask={market ? Number(market.ask) : null}
            marketStatus={marketStatus}
          />
        </div>
      </section>

      {/* =========================
          OPEN POSITIONS
          ========================= */}

      <PositionsPanel />

      {/* =========================
          ORDER HISTORY
          ========================= */}

      <OrdersPanel />
    </div>
  );
}
