import { useState } from "react";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";

import { usePositions } from "../hooks/usePositions";
import { useClosePosition } from "../hooks/useClosePosition";

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

  const positions = (positionsQuery.data ?? []).filter(
    (position) => position.status === "OPEN",
  );

  const confirmPosition = positions.find(
    (position) => position.id === confirmPositionId,
  );

  async function handleClose(positionId: string) {
    if (closingPositionId !== null) {
      return;
    }

    setClosingPositionId(positionId);

    try {
      await closePositionMutation.mutateAsync(positionId);
      setConfirmPositionId(null);
    } finally {
      setClosingPositionId(null);
    }
  }

  function handleRequestClose(positionId: string) {
    if (closingPositionId !== null) {
      return;
    }

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
        <div className="workspace-placeholder">Đang tải positions...</div>
      )}

      {positionsQuery.isError && (
        <div className="trading-order-panel__error">
          Không thể tải danh sách positions.
        </div>
      )}

      {!positionsQuery.isLoading &&
        !positionsQuery.isError &&
        positions.length === 0 && (
          <div className="workspace-placeholder">Chưa có position đang mở.</div>
        )}

      {positions.length > 0 && (
        <div className="positions-table-wrapper">
          <table className="positions-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Quantity</th>
                <th>Entry Price</th>
                <th>Current Price</th>
                <th>Unrealized P&amp;L</th>
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

                    <td>{formatMoney(position.averageEntryPrice)}</td>

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
                      <span className="position-status">{position.status}</span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="position-close-button"
                        onClick={() => handleRequestClose(position.id)}
                        disabled={closingPositionId !== null}
                      >
                        {isClosing ? "Closing..." : "Close"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {closePositionMutation.isError && (
        <div className="trading-order-panel__error">
          {closePositionMutation.error instanceof Error
            ? closePositionMutation.error.message
            : "Không thể đóng position."}
        </div>
      )}

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
                <h3 id="close-position-title">Đóng position?</h3>
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
                <strong>{formatMoney(confirmPosition.currentPrice)}</strong>
              </div>

              <div>
                <span>Unrealized P&amp;L</span>
                <strong>
                  {Number(confirmPosition.unrealizedPnl) >= 0 ? "+" : ""}
                  {formatMoney(confirmPosition.unrealizedPnl)}
                </strong>
              </div>
            </div>

            <p className="position-confirm-dialog__message">
              Bạn có chắc muốn đóng position này không? Hành động này sẽ thực
              hiện lệnh đóng position ngay lập tức.
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
                onClick={() => handleClose(confirmPosition.id)}
                disabled={closingPositionId !== null}
              >
                {closingPositionId === confirmPosition.id
                  ? "Closing..."
                  : `Close ${confirmPosition.side}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
