import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ArrowDownRight, Wallet } from "lucide-react";

import {
  getAccountBalance,
  getAccountBalanceHistory,
  getLastKnownAccountBalance,
  setLastKnownAccountBalance,
} from "../features/account/api";
import { AccountBalanceChart } from "../features/account/components/AccountBalanceChart";
import { useMarketStreamStatus } from "../features/market/MarketStreamBridge";
import { getMarketFreshnessDisplayState } from "../features/market/marketFreshnessDisplayState";
import { getMarketPrice } from "../features/market/api";
import {
  isMarketClosedApiError,
  markMarketClosedConfirmed,
  shouldPauseMarketPolling,
} from "../features/market/market-hours";
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
    queryFn: async () => {
      try {
        return await getAccountBalance();
      } catch (error) {
        if (isMarketClosedApiError(error)) {
          return getLastKnownAccountBalance() ?? null;
        }
        throw error;
      }
    },
    refetchInterval: 5000,
    initialData: getLastKnownAccountBalance() ?? undefined,
  });
  const balanceHistoryQuery = useQuery({
    queryKey: ["account", "balance-history"],
    queryFn: getAccountBalanceHistory,
    staleTime: 60_000,
  });

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
    refetchInterval: marketStreamConnected || marketClosed ? false : 2000,
    retry: false,
    placeholderData: undefined,
    initialData: undefined,
  });

  useEffect(() => {
    if (accountQuery.data) {
      setLastKnownAccountBalance(accountQuery.data);
    }
  }, [accountQuery.data]);

  const account = accountQuery.data ?? getLastKnownAccountBalance();
  const market = marketQuery.data;

  return (
    <div className="app-page overview-page">
      <div className="app-page__heading">
        <p className="app-eyebrow">PAPER TRADING</p>
        <h1>Overview</h1>
        <p>Xin chào, {user?.fullname ?? user?.email ?? "Trader"}.</p>
      </div>

      <section className="app-surface account-overview-surface" aria-label="Account overview">
        <div className="account-overview-surface__summary">
          <div className="app-balance-card__heading">
            <span>Account equity</span>
            <Wallet size={20} aria-hidden="true" />
          </div>
          <strong className="app-balance-card__amount">
            {account ? `$${money(account.equity)}` : "Không có dữ liệu"}
          </strong>
          <div className="app-balance-card__details app-account-metrics">
            <div className="app-account-metric">
              <span>Balance</span>
              <strong>{account ? `$${money(account.balance)}` : "Không có dữ liệu"}</strong>
            </div>
            <div className="app-account-metric">
              <span>Unrealized P&amp;L</span>
              <strong className={Number(account?.unrealizedPnl ?? 0) >= 0 ? "app-profit" : "app-loss"}>
                {account ? `$${money(account.unrealizedPnl)}` : "Không có dữ liệu"}
              </strong>
            </div>
            <div className="app-account-metric">
              <span>Used Margin</span>
              <strong>{account ? `$${money(account.usedMargin)}` : "Không có dữ liệu"}</strong>
            </div>
            <div className="app-account-metric">
              <span>Free Margin</span>
              <strong className={account && Number(account.freeMargin) < 0 ? "app-loss" : ""}>
                {account ? `$${money(account.freeMargin)}` : "Không có dữ liệu"}
              </strong>
            </div>
            <div className="app-account-metric">
              <span>Margin Level</span>
              <strong>
                {account
                  ? account.marginLevel === null
                    ? "—"
                    : `${money(account.marginLevel)}%`
                  : "Không có dữ liệu"}
              </strong>
            </div>
          </div>
          {accountQuery.isError && <p role="alert">Không thể tải thông tin tài khoản.</p>}
        </div>

        <div className="account-overview-surface__charts account-overview-surface__charts--single">
          <AccountBalanceChart
            history={balanceHistoryQuery.data}
            isLoading={balanceHistoryQuery.isLoading}
            currency={account?.currency ?? "USD"}
            title="Account equity"
            metric="equity"
            accentColor="#d6ad60"
            ariaLabel="Account equity history"
          />
        </div>

        <div className="account-overview-surface__market">
          <div className="account-overview-surface__market-heading">
            <div>
              <p className="app-eyebrow">MARKET SNAPSHOT</p>
              <h2>XAUUSD</h2>
            </div>
            <div className="app-market-badges">
              <span
                className={`app-market-freshness app-market-freshness--${marketClosed ? "disconnected" : marketFreshnessDisplay.toLowerCase()}`}
                role="status"
                aria-label={`Market data status: ${marketClosed ? "THỊ TRƯỜNG ĐÓNG CỬA" : marketFreshnessDisplay}`}
              >
                {marketClosed
                  ? "Thị trường đóng cửa"
                  : marketFreshnessDisplay === "LIVE"
                    ? "Đang mở"
                    : marketFreshnessDisplay === "STALE"
                      ? "Chậm"
                      : marketFreshnessDisplay === "DISCONNECTED"
                        ? "Mất kết nối"
                        : "Đang chờ"}
              </span>
            </div>
          </div>
          <div className="account-overview-surface__quotes">
            <div className="app-quote">
              <span><ArrowDownRight size={16} /> BID · SELL</span>
              <strong>{market ? money(market.bid) : "Không có dữ liệu"}</strong>
            </div>
            <div className="app-quote">
              <span><ArrowUpRight size={16} /> ASK · BUY</span>
              <strong>{market ? money(market.ask) : "Không có dữ liệu"}</strong>
            </div>
          </div>
          {market && !market.metadata.executable && (
            <p role="status">
              Giá tham khảo từ {market.source}. BID/ASK đang được mô phỏng;
              không sử dụng để khớp lệnh.
            </p>
          )}
          {marketQuery.isError && <p role="alert">Không thể tải giá thị trường.</p>}
        </div>
      </section>
    </div>
  );
}
