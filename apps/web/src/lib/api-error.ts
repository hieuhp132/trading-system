import axios from "axios";

import type { ApiErrorResponse } from "../types/api";

export function getApiErrorMessage(
  error: unknown,
  fallback = "Đã xảy ra lỗi. Vui lòng thử lại.",
): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data?.error?.message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }

    if (error.code === "ECONNABORTED") {
      return "Yêu cầu quá thời gian chờ. Vui lòng thử lại.";
    }

    if (!error.response) {
      return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối.";
    }
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return fallback;
}
