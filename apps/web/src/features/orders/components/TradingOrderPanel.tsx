import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { useCreateOrder } from "../hooks/useCreateOrder";
import type { OrderSide } from "../api";

type MarketStatus = "loading" | "online" | "offline";

interface TradingOrderPanelProps {
  symbol: "XAUUSD";
  bid: number | null;
  ask: number | null;
  marketStatus: MarketStatus;
  onOrderSuccess?: () => void;
}

export function TradingOrderPanel({
  symbol,
  bid,
  ask,
  marketStatus,
  onOrderSuccess,
}: TradingOrderPanelProps) {
  const [quantity, setQuantity] = useState("1");
  const [submittingSide, setSubmittingSide] = useState<OrderSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createOrderMutation = useCreateOrder();
  const parsedQuantity = Number(quantity);

  const hasValidMarket =
    marketStatus === "online" &&
    bid !== null &&
    ask !== null &&
    Number.isFinite(bid) &&
    Number.isFinite(ask) &&
    bid > 0 &&
    ask > 0 &&
    ask >= bid;

  const canSubmit =
    Number.isFinite(parsedQuantity) &&
    parsedQuantity > 0 &&
    hasValidMarket &&
    submittingSide === null;

  async function handleOrder(side: OrderSide) {
    if (!canSubmit) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSubmittingSide(side);

    try {
      await createOrderMutation.mutateAsync({
        symbol,
        side,
        type: "MARKET",
        quantity,
      });

      const formattedQuantity = Number(quantity).toString();

      setSuccessMessage(
        `${side} MARKET ${formattedQuantity} ${symbol} đã được thực hiện thành công.`,
      );

      onOrderSuccess?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể tạo order.";

      setError(message);
    } finally {
      setSubmittingSide(null);
    }
  }

  return (
    <section className="trading-order-panel">
      <div className="trading-order-panel__header">
        <div>
          <h2>Market Order</h2>
          <span>{symbol}</span>
        </div>
      </div>

      <div className="trading-order-panel__prices">
        <div>
          <span>Bid</span>
          <strong>{bid !== null ? bid.toFixed(2) : "--"}</strong>
        </div>

        <div>
          <span>Ask</span>
          <strong>{ask !== null ? ask.toFixed(2) : "--"}</strong>
        </div>
      </div>
      {marketStatus === "loading" && (
        <div
          className="trading-order-panel__market-status"
          role="status"
          aria-live="polite"
        >
          Đang kết nối market...
        </div>
      )}

      {marketStatus === "offline" && (
        <div
          className="trading-order-panel__market-status"
          role="alert"
          aria-live="assertive"
        >
          Market đang offline. Không thể thực hiện order.
        </div>
      )}
      <div className="trading-order-panel__field">
        <label htmlFor="order-quantity">Quantity</label>

        <input
          id="order-quantity"
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
            setError(null);
            setSuccessMessage(null);
          }}
          disabled={submittingSide !== null}
        />
      </div>

      {successMessage && (
        <div
          className="trading-order-panel__success"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          className="trading-order-panel__error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      <div className="trading-order-panel__actions">
        <button
          type="button"
          onClick={() => handleOrder("BUY")}
          disabled={!canSubmit}
        >
          {submittingSide === "BUY" ? "Buying..." : "BUY MARKET"}
        </button>

        <button
          type="button"
          onClick={() => handleOrder("SELL")}
          disabled={!canSubmit}
        >
          {submittingSide === "SELL" ? "Selling..." : "SELL MARKET"}
        </button>
      </div>
    </section>
  );
}
