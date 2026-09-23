import { useState } from "react";

import { getApiErrorMessage } from "../../../lib/api-error";
import type { Position } from "../api";
import { useUpdatePositionStops } from "../hooks/useUpdatePositionStops";

interface Props {
  position: Position;
  onClose: () => void;
}

function isValidPrice(value: string): boolean {
  return (
    /^\d+(\.\d{1,2})?$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

export function EditPositionStopsDialog({
  position,
  onClose,
}: Props) {
  const mutation = useUpdatePositionStops();

  const [stopLoss, setStopLoss] = useState(
    position.stopLoss ?? "",
  );

  const [takeProfit, setTakeProfit] = useState(
    position.takeProfit ?? "",
  );

  const validStopLoss =
    stopLoss.trim() === "" || isValidPrice(stopLoss.trim());

  const validTakeProfit =
    takeProfit.trim() === "" || isValidPrice(takeProfit.trim());

  const hasChanges =
    (stopLoss.trim() || null) !== position.stopLoss ||
    (takeProfit.trim() || null) !== position.takeProfit;

  const canSave =
    validStopLoss &&
    validTakeProfit &&
    hasChanges &&
    !mutation.isPending;

  async function handleSave() {
    if (!canSave) {
      return;
    }

    try {
      await mutation.mutateAsync({
        positionId: position.id,
        stopLoss: stopLoss.trim() || null,
        takeProfit: takeProfit.trim() || null,
      });

      onClose();
    } catch {
      // Error is displayed through mutation.error.
    }
  }

  return (
    <div className="position-confirm-overlay">
      <div
        className="position-confirm-dialog position-stops-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-position-stops-title"
      >
        <div className="position-confirm-dialog__header">
          <div>
            <span className="position-confirm-dialog__eyebrow">
              RISK MANAGEMENT
            </span>

            <h3 id="edit-position-stops-title">
              Edit Stop Loss / Take Profit
            </h3>
          </div>

          <button
            type="button"
            className="position-confirm-dialog__close"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="Đóng cửa sổ"
          >
            ×
          </button>
        </div>

        <div className="position-confirm-dialog__details">
          <div>
            <span>Symbol</span>
            <strong>{position.symbol}</strong>
          </div>

          <div>
            <span>Side</span>
            <strong>{position.side}</strong>
          </div>

          <div>
            <span>Quantity</span>
            <strong>{position.quantity} lots</strong>
          </div>

          <div>
            <span>Current Price</span>
            <strong>{position.currentPrice}</strong>
          </div>
        </div>

        <div className="position-stops-dialog__fields">
          <div className="position-stops-dialog__field">
            <label htmlFor="edit-stop-loss">
              Stop Loss (SL)
            </label>

            <input
              id="edit-stop-loss"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="Leave empty to remove"
              value={stopLoss}
              onChange={(event) =>
                setStopLoss(event.target.value)
              }
              disabled={mutation.isPending}
              aria-invalid={!validStopLoss}
            />

            {!validStopLoss && (
              <p className="position-stops-dialog__error">
                SL phải là số dương, tối đa 2 chữ số thập phân.
              </p>
            )}
          </div>

          <div className="position-stops-dialog__field">
            <label htmlFor="edit-take-profit">
              Take Profit (TP)
            </label>

            <input
              id="edit-take-profit"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="Leave empty to remove"
              value={takeProfit}
              onChange={(event) =>
                setTakeProfit(event.target.value)
              }
              disabled={mutation.isPending}
              aria-invalid={!validTakeProfit}
            />

            {!validTakeProfit && (
              <p className="position-stops-dialog__error">
                TP phải là số dương, tối đa 2 chữ số thập phân.
              </p>
            )}
          </div>

          <p className="position-stops-dialog__hint">
            Để trống một trường để xóa mức giá tương ứng.
            Backend sẽ kiểm tra SL/TP theo giá thị trường
            tại thời điểm lưu.
          </p>

          {mutation.isError && (
            <p
              className="position-stops-dialog__error"
              role="alert"
            >
              {getApiErrorMessage(mutation.error, "Không thể cập nhật SL/TP.")}
            </p>
          )}
        </div>

        <div className="position-confirm-dialog__actions">
          <button
            type="button"
            className="position-confirm-dialog__cancel"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>

          <button
            type="button"
            className="position-confirm-dialog__confirm position-stops-dialog__save"
            onClick={handleSave}
            disabled={!canSave}
          >
            {mutation.isPending ? "Saving..." : "Save SL/TP"}
          </button>
        </div>
      </div>
    </div>
  );
}
