import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";

import { getAccountBalance } from "../features/account/api";
import { useMarketStreamStatus } from "../features/market/MarketStreamBridge";
import { getMarketFreshnessDisplayState } from "../features/market/marketFreshnessDisplayState";
import { getMarketPrice } from "../features/market/api";
import { useAuthStore } from "../stores/auth";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));

export function DashboardPage() {
  const {
    connected: marketStreamConnected,
    freshness: marketFreshness,
  } = useMarketStreamStatus();

  const marketFreshnessDisplay =
    getMarketFreshnessDisplayState({
      connected: marketStreamConnected,
      freshness: marketFreshness,
    });
  const user = useAuthStore((state) => state.user);

  const accountQuery = useQuery({
    queryKey: ["account", "balance"],
    queryFn: getAccountBalance,
    refetchInterval: 5000,
  });

  const marketQuery = useQuery({
    queryKey: ["market", "XAUUSD"],
    queryFn: () => getMarketPrice("XAUUSD"),
    refetchInterval: marketStreamConnected ? false : 2000,
  });

  const account = accountQuery.data;
  const market = marketQuery.data;

  return (
    <div className="app-page">
      <div className="app-page__heading">
        <p className="app-eyebrow">PAPER TRADING</p>
        <h1>Overview</h1>
        <p>Xin chào, {user?.fullname ?? user?.email ?? "Trader"}.</p>
      </div>

      <section className="app-balance-card" aria-label="Account overview">
        <div className="app-balance-card__heading">
          <span>Account equity</span>
          <Wallet size={20} aria-hidden="true" />
        </div>

        <strong className="app-balance-card__amount">
          {account ? `$${money(account.equity)}` : "--"}
        </strong>

        <div className="app-balance-card__details app-account-metrics">
          <div className="app-account-metric">
            <span>Balance</span>
            <strong>
              {account ? `$${money(account.balance)}` : "--"}
            </strong>
          </div>

          <div className="app-account-metric">
            <span>Unrealized P&amp;L</span>
            <strong
              className={
                Number(account?.unrealizedPnl ?? 0) >= 0
                  ? "app-profit"
                  : "app-loss"
              }
            >
              {account ? `$${money(account.unrealizedPnl)}` : "--"}
            </strong>
          </div>

          <div className="app-account-metric">
            <span>Used Margin</span>
            <strong>
              {account ? `$${money(account.usedMargin)}` : "--"}
            </strong>
          </div>

          <div className="app-account-metric">
            <span>Free Margin</span>
            <strong
              className={
                account && Number(account.freeMargin) < 0
                  ? "app-loss"
                  : ""
              }
            >
              {account ? `$${money(account.freeMargin)}` : "--"}
            </strong>
          </div>

          <div className="app-account-metric">
            <span>Margin Level</span>
            <strong>
              {account
                ? account.marginLevel === null
                  ? "—"
                  : `${money(account.marginLevel)}%`
                : "--"}
            </strong>
          </div>
        </div>
        {accountQuery.isError && (
          <p role="alert">Không thể tải thông tin tài khoản.</p>
        )}
      </section>

      <section className="app-surface" aria-label="Market snapshot">
        <div className="app-section-heading">
          <div>
            <p className="app-eyebrow">MARKET SNAPSHOT</p>
            <h2>XAUUSD</h2>
          </div>
          <div className="app-market-badges">
            <span className="app-demo-badge">
              {marketQuery.isError
                ? "Offline"
                : !market
                  ? "Loading"
                  : market.metadata.executable
                    ? "Demo"
                    : "Reference only"}
            </span>

            <span
              className={`app-market-freshness app-market-freshness--${marketFreshnessDisplay.toLowerCase()}`}
              role="status"
              aria-label={`Market data status: ${marketFreshnessDisplay}`}
            >
              {marketFreshnessDisplay === "LIVE"
                ? "Live"
                : marketFreshnessDisplay === "STALE"
                  ? "Stale"
                  : marketFreshnessDisplay === "DISCONNECTED"
                    ? "Disconnected"
                    : "Waiting"}
            </span>
          </div>
        </div>

        <div className="app-quote-grid">
          <div className="app-quote">
            <span><ArrowDownRight size={16} /> BID · SELL</span>
            <strong>{market ? money(market.bid) : "--"}</strong>
          </div>
          <div className="app-quote">
            <span><ArrowUpRight size={16} /> ASK · BUY</span>
            <strong>{market ? money(market.ask) : "--"}</strong>
          </div>
        </div>
        {market && !market.metadata.executable && (
          <p role="status">
            Giá tham khảo từ {market.source}. BID/ASK đang được mô phỏng;
            không sử dụng để khớp lệnh.
          </p>
        )}
        {marketQuery.isError && (
          <p role="alert">Không thể tải giá thị trường.</p>
        )}
      </section>
    </div>
  );
}
