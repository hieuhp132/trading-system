import { useState } from "react";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";

import { usePositions } from "../hooks/usePositions";
import { useClosePosition } from "../hooks/useClosePosition";
import { EditPositionStopsDialog } from "./EditPositionStopsDialog";

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function PositionsPanel() {
  const positionsQuery = usePositions();
  const closePositionMutation = useClosePosition();

  const [closingPositionId, setClosingPositionId] = useState<string | null>(
    null,
  );

  const [confirmPositionId, setConfirmPositionId] = useState<string | null>(
    null,
  );

  const [editingPositionId, setEditingPositionId] = useState<string | null>(
    null,
  );

  const [closeMode, setCloseMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialQuantity, setPartialQuantity] = useState("");

  const positions = (positionsQuery.data ?? []).filter(
    (position) => position.status === "OPEN",
  );

  const confirmPosition = positions.find(
    (position) => position.id === confirmPositionId,
  );

  const positionQuantity = confirmPosition
    ? Number(confirmPosition.quantity)
    : 0;

  const requestedQuantity = Number(partialQuantity);

  const quantityInSteps = requestedQuantity * 100;

  const isValidPartialQuantity =
    closeMode === "PARTIAL" &&
    partialQuantity.trim() !== "" &&
    /^\d+(\.\d{1,2})?$/.test(partialQuantity.trim()) &&
    Number.isFinite(requestedQuantity) &&
    requestedQuantity >= 0.01 &&
    requestedQuantity < positionQuantity &&
    Math.abs(quantityInSteps - Math.round(quantityInSteps)) < 1e-8;

  const remainingQuantity = isValidPartialQuantity
    ? Math.round(
        (positionQuantity - requestedQuantity) * 100,
      ) / 100
    : null;

  async function handleClose(positionId: string) {
    if (closingPositionId !== null) {
      return;
    }

    setClosingPositionId(positionId);

    try {
      await closePositionMutation.mutateAsync({
        positionId,
        ...(closeMode === "PARTIAL"
          ? { quantity: requestedQuantity.toFixed(2) }
          : {}),
      });
      setConfirmPositionId(null);
    } finally {
      setClosingPositionId(null);
    }
  }

  function handleRequestClose(positionId: string) {
    if (closingPositionId !== null) {
      return;
    }

    setCloseMode("FULL");
    setPartialQuantity("");
    setConfirmPositionId(positionId);
  }

  function handleCancelClose() {
    if (closingPositionId !== null) {
      return;
    }

    setConfirmPositionId(null);
  }

  return (
    <section className="dashboard-panel positions-panel">
      <div className="panel-header">
        <div>
          <h2>Open Positions</h2>
          <p>Các vị thế XAUUSD đang mở.</p>
        </div>

        <Activity size={18} />
      </div>

      {positionsQuery.isLoading && (
        <div className="workspace-placeholder">
          Đang tải positions...
        </div>
      )}

      {positionsQuery.isError && (
        <div className="trading-order-panel__error">
          Không thể tải danh sách positions.
        </div>
      )}

      {!positionsQuery.isLoading &&
        !positionsQuery.isError &&
        positions.length === 0 && (
          <div className="workspace-placeholder">
            Chưa có position đang mở.
          </div>
        )}

      {positions.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="positions-table-wrapper positions-desktop">
            <table className="positions-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Quantity</th>
                  <th>Entry Price</th>
                  <th>Current Price</th>
                  <th>Unrealized P&amp;L</th>
                  <th>Stop Loss</th>
                  <th>Take Profit</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {positions.map((position) => {
                  const pnl = Number(position.unrealizedPnl);
                  const isProfit = pnl >= 0;
                  const isClosing = closingPositionId === position.id;

                  return (
                    <tr key={position.id}>
                      <td>
                        <strong>{position.symbol}</strong>
                      </td>

                      <td>
                        <span
                          className={`position-side position-side--${position.side.toLowerCase()}`}
                        >
                          {position.side === "LONG" ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}

                          {position.side}
                        </span>
                      </td>

                      <td>{position.quantity}</td>

                      <td>
                        {formatMoney(position.averageEntryPrice)}
                      </td>

                      <td>{formatMoney(position.currentPrice)}</td>

                      <td
                        className={
                          isProfit
                            ? "position-pnl position-pnl--profit"
                            : "position-pnl position-pnl--loss"
                        }
                      >
                        {isProfit ? "+" : ""}
                        {formatMoney(pnl)}
                      </td>
                      <td>
                        {position.stopLoss === null
                          ? "—"
                          : formatMoney(position.stopLoss)}
                      </td>

                      <td>
                        {position.takeProfit === null
                          ? "—"
                          : formatMoney(position.takeProfit)}
                      </td>

                      <td>
                        <span className="position-status">
                          {position.status}
                        </span>
                      </td>

                      <td>
                        <div className="position-stops-actions">
                          <button
                            type="button"
                            className="position-close-button"
                            onClick={() => setEditingPositionId(position.id)}
                            disabled={closingPositionId !== null}
                          >
                            Edit SL/TP
                          </button>

                        <button
                          type="button"
                          className="position-close-button"
                          onClick={() =>
                            handleRequestClose(position.id)
                          }
                          disabled={closingPositionId !== null}
                        >
                          {isClosing ? "Closing..." : "Close"}
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="positions-mobile">
            {positions.map((position) => {
              const pnl = Number(position.unrealizedPnl);
              const isProfit = pnl >= 0;
              const isClosing = closingPositionId === position.id;

              return (
                <article
                  className="position-mobile-card"
                  key={position.id}
                >
                  <div className="position-mobile-card__header">
                    <div>
                      <strong className="position-mobile-card__symbol">
                        {position.symbol}
                      </strong>

                      <span
                        className={`position-side position-side--${position.side.toLowerCase()}`}
                      >
                        {position.side === "LONG" ? (
                          <TrendingUp size={14} />
                        ) : (
                          <TrendingDown size={14} />
                        )}

                        {position.side}
                      </span>
                    </div>

                    <span className="position-status">
                      {position.status}
                    </span>
                  </div>

                  <div className="position-mobile-card__pnl">
                    <span>Unrealized P&amp;L</span>

                    <strong
                      className={
                        isProfit
                          ? "position-pnl position-pnl--profit"
                          : "position-pnl position-pnl--loss"
                      }
                    >
                      {isProfit ? "+" : ""}
                      {formatMoney(pnl)}
                    </strong>
                  </div>

                  <div className="position-mobile-card__details">
                    <div>
                      <span>Quantity</span>
                      <strong>{position.quantity}</strong>
                    </div>

                    <div>
                      <span>Entry Price</span>
                      <strong>
                        {formatMoney(position.averageEntryPrice)}
                      </strong>
                    </div>

                    <div>
                      <span>Current Price</span>
                      <strong>
                        {formatMoney(position.currentPrice)}
                      </strong>
                    </div>
                  </div>
                      <div>
                        <span>Stop Loss</span>
                        <strong>
                          {position.stopLoss === null
                            ? "—"
                            : formatMoney(position.stopLoss)}
                        </strong>
                      </div>

                      <div>
                        <span>Take Profit</span>
                        <strong>
                          {position.takeProfit === null
                            ? "—"
                            : formatMoney(position.takeProfit)}
                        </strong>
                      </div>

                  <div className="position-stops-actions position-stops-actions--mobile">
                    <button
                      type="button"
                      className="position-close-button"
                      onClick={() => setEditingPositionId(position.id)}
                      disabled={closingPositionId !== null}
                    >
                      Edit SL/TP
                    </button>

                  <button
                    type="button"
                    className="position-close-button position-mobile-card__close"
                    onClick={() =>
                      handleRequestClose(position.id)
                    }
                    disabled={closingPositionId !== null}
                  >
                    {isClosing ? "Closing..." : "Close Position"}
                  </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {closePositionMutation.isError && (
        <div className="trading-order-panel__error">
          {closePositionMutation.error instanceof Error
            ? closePositionMutation.error.message
            : "Không thể đóng position."}
        </div>
      )}

      {editingPositionId &&
        positions
          .filter((position) => position.id === editingPositionId)
          .map((position) => (
            <EditPositionStopsDialog
              key={position.id}
              position={position}
              onClose={() => setEditingPositionId(null)}
            />
          ))}

      {confirmPosition && (
        <div className="position-confirm-overlay">
          <div
            className="position-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-position-title"
          >
            <div className="position-confirm-dialog__header">
              <div>
                <span className="position-confirm-dialog__eyebrow">
                  CLOSE POSITION
                </span>

                <h3 id="close-position-title">
                  Đóng position?
                </h3>
              </div>

              <button
                type="button"
                className="position-confirm-dialog__close"
                onClick={handleCancelClose}
                disabled={closingPositionId !== null}
                aria-label="Đóng cửa sổ xác nhận"
              >
                ×
              </button>
            </div>

            <div className="position-confirm-dialog__details">
              <div>
                <span>Symbol</span>
                <strong>{confirmPosition.symbol}</strong>
              </div>

              <div>
                <span>Side</span>
                <strong>{confirmPosition.side}</strong>
              </div>

              <div>
                <span>Quantity</span>
                <strong>{confirmPosition.quantity}</strong>
              </div>

              <div>
                <span>Entry Price</span>
                <strong>
                  {formatMoney(confirmPosition.averageEntryPrice)}
                </strong>
              </div>

              <div>
                <span>Current Price</span>
                <strong>
                  {formatMoney(confirmPosition.currentPrice)}
                </strong>
              </div>

              <div>
                <span>Unrealized P&amp;L</span>
                <strong>
                  {Number(confirmPosition.unrealizedPnl) >= 0
                    ? "+"
                    : ""}
                  {formatMoney(confirmPosition.unrealizedPnl)}
                </strong>
              </div>
            </div>

            <div className="position-close-options">
              <div className="position-close-options__modes">
                <button
                  type="button"
                  className={
                    closeMode === "FULL"
                      ? "position-close-options__mode is-active"
                      : "position-close-options__mode"
                  }
                  onClick={() => setCloseMode("FULL")}
                  disabled={closingPositionId !== null}
                >
                  Full Close
                </button>

                <button
                  type="button"
                  className={
                    closeMode === "PARTIAL"
                      ? "position-close-options__mode is-active"
                      : "position-close-options__mode"
                  }
                  onClick={() => setCloseMode("PARTIAL")}
                  disabled={closingPositionId !== null}
                >
                  Partial Close
                </button>
              </div>

              {closeMode === "PARTIAL" && (
                <div className="position-close-options__partial">
                  <label htmlFor="partial-close-quantity">
                    Quantity to close (lots)
                  </label>

                  <input
                    id="partial-close-quantity"
                    type="number"
                    min="0.01"
                    max={confirmPosition.quantity}
                    step="0.01"
                    inputMode="decimal"
                    value={partialQuantity}
                    onChange={(event) =>
                      setPartialQuantity(event.target.value)
                    }
                    disabled={closingPositionId !== null}
                    placeholder="0.01"
                    aria-invalid={
                      partialQuantity !== "" &&
                      !isValidPartialQuantity
                    }
                  />

                  <div className="position-close-options__summary">
                    <div>
                      <span>Current</span>
                      <strong>
                        {formatMoney(positionQuantity)} lots
                      </strong>
                    </div>

                    <div>
                      <span>Close</span>
                      <strong>
                        {isValidPartialQuantity
                          ? formatMoney(requestedQuantity)
                          : "--"}{" "}
                        lots
                      </strong>
                    </div>

                    <div>
                      <span>Remaining</span>
                      <strong>
                        {remainingQuantity !== null
                          ? formatMoney(remainingQuantity)
                          : "--"}{" "}
                        lots
                      </strong>
                    </div>
                  </div>

                  {partialQuantity !== "" &&
                    !isValidPartialQuantity && (
                      <p
                        className="position-close-options__error"
                        role="alert"
                      >
                        Quantity phải từ 0.01 lot, theo bước
                        0.01 và nhỏ hơn quantity hiện tại.
                        Để đóng toàn bộ, chọn Full Close.
                      </p>
                    )}
                </div>
              )}
            </div>

            <p className="position-confirm-dialog__message">
              Bạn có chắc muốn đóng position này không?
              Hành động này sẽ thực hiện lệnh đóng position
              ngay lập tức.
            </p>

            <div className="position-confirm-dialog__actions">
              <button
                type="button"
                className="position-confirm-dialog__cancel"
                onClick={handleCancelClose}
                disabled={closingPositionId !== null}
              >
                Cancel
              </button>

              <button
                type="button"
                className="position-confirm-dialog__confirm"
                onClick={() =>
                  handleClose(confirmPosition.id)
                }
                disabled={
                  closingPositionId !== null ||
                  (closeMode === "PARTIAL" &&
                    !isValidPartialQuantity)
                }
              >
                {closingPositionId === confirmPosition.id
                  ? "Closing..."
                  : closeMode === "PARTIAL"
                    ? `Close ${partialQuantity} lots`
                    : `Close ${confirmPosition.side}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
