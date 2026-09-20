import { AppError } from "../../common/errors/app-error.js";

/**
 * Validate SL/TP against the executable closing price.
 * LONG closes at BID; SHORT closes at ASK.
 */
export function validateStopLevels(
  side: "LONG" | "SHORT",
  bid: number,
  ask: number,
  stopLoss?: string | null,
  takeProfit?: string | null,
): void {
  if (
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0 ||
    bid > ask
  ) {
    throw new AppError("BID/ASK không hợp lệ", 502, "INVALID_MARKET_PRICE");
  }

  const closingPrice = side === "LONG" ? bid : ask;

  const parseStop = (value: string | null | undefined, name: string): number | null => {
    if (value === null || value === undefined) return null;

    // Do not accept whitespace, exponential notation, negative signs or NaN.
    if (!/^\d+(\.\d+)?$/.test(value)) {
      throw new AppError(`${name} không hợp lệ`, 400, "INVALID_STOP_PRICE");
    }

    const price = Number(value);
    if (!Number.isFinite(price) || price <= 0) {
      throw new AppError(`${name} phải lớn hơn 0`, 400, "INVALID_STOP_PRICE");
    }
    return price;
  };

  const sl = parseStop(stopLoss, "Stop Loss");
  const tp = parseStop(takeProfit, "Take Profit");

  if (side === "LONG") {
    if (sl !== null && sl >= closingPrice) {
      throw new AppError("LONG Stop Loss phải thấp hơn BID", 400, "INVALID_STOP_LOSS");
    }
    if (tp !== null && tp <= closingPrice) {
      throw new AppError("LONG Take Profit phải cao hơn BID", 400, "INVALID_TAKE_PROFIT");
    }
  } else {
    if (sl !== null && sl <= closingPrice) {
      throw new AppError("SHORT Stop Loss phải cao hơn ASK", 400, "INVALID_STOP_LOSS");
    }
    if (tp !== null && tp >= closingPrice) {
      throw new AppError("SHORT Take Profit phải thấp hơn ASK", 400, "INVALID_TAKE_PROFIT");
    }
  }
}
