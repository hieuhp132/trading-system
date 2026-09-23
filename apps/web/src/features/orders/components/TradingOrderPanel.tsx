import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { getApiErrorMessage } from "../../../lib/api-error";
import { useCreateOrder } from "../hooks/useCreateOrder";
import type { CreateOrderInput, OrderSide, OrderType } from "../api";

type MarketStatus = "loading" | "online" | "offline";
type OrderMode = "MARKET" | "LIMIT";

interface TradingOrderPanelProps {
  symbol: "XAUUSD";
  bid: number | null;
  ask: number | null;
  marketStatus: MarketStatus;
  onOrderSuccess?: () => void;
}

function isValidPrice(value: string): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return false;
  }

  const price = Number(value);

  return Number.isFinite(price) && price > 0;
}

function isValidQuantity(value: string): boolean {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) {
    return false;
  }

  const quantity = Number(value);

  return (
    Number.isFinite(quantity) &&
    quantity >= 0.01 &&
    Number.isInteger(Math.round(quantity * 100)) &&
    Math.abs(quantity * 100 - Math.round(quantity * 100)) < 1e-8
  );
}

export function TradingOrderPanel({
  symbol,
  bid,
  ask,
  marketStatus,
  onOrderSuccess,
}: TradingOrderPanelProps) {
  const [mode, setMode] = useState<OrderMode>("MARKET");
  const [quantity, setQuantity] = useState("0.01");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");

  const [submittingSide, setSubmittingSide] = useState<OrderSide | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createOrderMutation = useCreateOrder();

  const hasValidMarket =
    marketStatus === "online" &&
    bid !== null &&
    ask !== null &&
    Number.isFinite(bid) &&
    Number.isFinite(ask) &&
    bid > 0 &&
    ask > 0 &&
    ask >= bid;

  const validQuantity = isValidQuantity(quantity);

  const validLimitPrice = mode === "MARKET" || isValidPrice(limitPrice);

  const validStopLoss = stopLoss.trim() === "" || isValidPrice(stopLoss);

  const validTakeProfit = takeProfit.trim() === "" || isValidPrice(takeProfit);

  const canSubmit =
    hasValidMarket &&
    validQuantity &&
    validLimitPrice &&
    validStopLoss &&
    validTakeProfit &&
    submittingSide === null;

  function clearMessages() {
    setError(null);
    setSuccessMessage(null);
  }

  async function handleOrder(side: OrderSide) {
    if (!canSubmit) {
      return;
    }

    const orderType: OrderType =
      mode === "MARKET"
        ? "MARKET"
        : side === "BUY"
          ? "BUY_LIMIT"
          : "SELL_LIMIT";

    const input: CreateOrderInput = {
      symbol,
      side,
      orderType,
      quantity: quantity.trim(),
    };

    if (mode === "LIMIT") {
      input.price = limitPrice.trim();
    }

    if (stopLoss.trim() !== "") {
      input.stopLoss = stopLoss.trim();
    }

    if (takeProfit.trim() !== "") {
      input.takeProfit = takeProfit.trim();
    }

    clearMessages();
    setSubmittingSide(side);

    try {
      const result = await createOrderMutation.mutateAsync(input);

      setSuccessMessage(
        result.order.status === "FILLED"
          ? `${orderType} ${quantity} lot đã khớp thành công.`
          : `${orderType} ${quantity} lot: ${result.order.status}.`,
      );

      onOrderSuccess?.();
    } catch (err) {
      setError(getApiErrorMessage(err, "Không thể tạo order."));
    } finally {
      setSubmittingSide(null);
    }
  }

  return (
    <section className="trading-order-panel">
      <div className="trading-order-panel__header">
        <div>
          <h2>Trading Order</h2>
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
        <div className="trading-order-panel__market-status" role="status">
          Đang kết nối market...
        </div>
      )}

      {marketStatus === "offline" && (
        <div className="trading-order-panel__market-status" role="alert">
          Market đang offline. Không thể thực hiện order.
        </div>
      )}

      <div className="trading-order-panel__field">
        <label htmlFor="order-mode">Order Type</label>

        <select
          id="order-mode"
          value={mode}
          disabled={submittingSide !== null}
          onChange={(event) => {
            setMode(event.target.value as OrderMode);
            clearMessages();
          }}
        >
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
        </select>
      </div>

      <div className="trading-order-panel__field">
        <label htmlFor="order-quantity">Volume (lot)</label>

        <input
          id="order-quantity"
          type="number"
          min="0.01"
          step="0.01"
          value={quantity}
          disabled={submittingSide !== null}
          onChange={(event) => {
            setQuantity(event.target.value);
            clearMessages();
          }}
        />

        {!validQuantity && (
          <small role="alert">Volume tối thiểu 0.01 lot, bước tăng 0.01.</small>
        )}
      </div>

      {mode === "LIMIT" && (
        <div className="trading-order-panel__field">
          <label htmlFor="order-limit-price">Limit Price</label>

          <input
            id="order-limit-price"
            type="number"
            min="0.01"
            step="0.01"
            value={limitPrice}
            disabled={submittingSide !== null}
            onChange={(event) => {
              setLimitPrice(event.target.value);
              clearMessages();
            }}
          />

          {!validLimitPrice && (
            <small role="alert">
              Nhập giá Limit hợp lệ, tối đa 2 chữ số thập phân.
            </small>
          )}
        </div>
      )}

      <div className="trading-order-panel__field">
        <label htmlFor="order-stop-loss">Stop Loss (optional)</label>

        <input
          id="order-stop-loss"
          type="number"
          min="0.01"
          step="0.01"
          value={stopLoss}
          disabled={submittingSide !== null}
          onChange={(event) => {
            setStopLoss(event.target.value);
            clearMessages();
          }}
        />

        {!validStopLoss && (
          <small role="alert">
            Stop Loss phải là giá dương, tối đa 2 chữ số thập phân.
          </small>
        )}
      </div>

      <div className="trading-order-panel__field">
        <label htmlFor="order-take-profit">Take Profit (optional)</label>

        <input
          id="order-take-profit"
          type="number"
          min="0.01"
          step="0.01"
          value={takeProfit}
          disabled={submittingSide !== null}
          onChange={(event) => {
            setTakeProfit(event.target.value);
            clearMessages();
          }}
        />

        {!validTakeProfit && (
          <small role="alert">
            Take Profit phải là giá dương, tối đa 2 chữ số thập phân.
          </small>
        )}
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
        <div className="trading-order-panel__error" role="alert">
          {error}
        </div>
      )}

      <div className="trading-order-panel__actions">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => handleOrder("BUY")}
        >
          {submittingSide === "BUY"
            ? "Buying..."
            : mode === "MARKET"
              ? "BUY MARKET"
              : "BUY LIMIT"}
        </button>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => handleOrder("SELL")}
        >
          {submittingSide === "SELL"
            ? "Selling..."
            : mode === "MARKET"
              ? "SELL MARKET"
              : "SELL LIMIT"}
        </button>
      </div>
    </section>
  );
}
