import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { AppError } from "./app-error.js";
import { TradingQuoteError } from "../../modules/market/trading-quote.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  /*
   * Zod validation error
   *
   * Ví dụ:
   * quantity = 0
   * quantity = "abc"
   * side = "HOLD"
   *
   * => HTTP 400
   */
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu request không hợp lệ",
        details: error.flatten(),
      },
    });

    return;
  }

  /*
   * Business / application error
   */
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });

    return;
  }

  if (error instanceof TradingQuoteError) {
    res.status(503).json({
      success: false,
      error: {
        code: "TRADING_QUOTE_STALE",
        message:
          "Giá thị trường quá cũ để đặt lệnh hoặc chỉnh SL/TP. Vui lòng thử lại khi dữ liệu còn mới.",
      },
    });

    return;
  }

  /*
   * Unexpected error
   */
  console.error("[UnhandledError]", error);

  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
