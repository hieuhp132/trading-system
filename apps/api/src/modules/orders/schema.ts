import { z } from "zod";

export const createOrderSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "XAUUSD", {
        message: "Hiện tại hệ thống chỉ hỗ trợ XAUUSD",
      }),

    side: z.enum(["BUY", "SELL"]),

    orderType: z.enum(["MARKET", "BUY_LIMIT", "SELL_LIMIT"]).default("MARKET"),

    quantity: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, {
        message: "Quantity phải là số dương",
      })
      .refine((value) => Number(value) > 0, {
        message: "Quantity phải lớn hơn 0",
      }),

    price: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, {
        message: "Price phải là số dương",
      })
      .optional(),

    stopLoss: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, {
        message: "Stop Loss phải là số dương",
      })
      .optional(),

    takeProfit: z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, {
        message: "Take Profit phải là số dương",
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === "BUY_LIMIT" && data.side !== "BUY") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side"],
        message: "BUY_LIMIT phải có side BUY",
      });
    }

    if (data.orderType === "SELL_LIMIT" && data.side !== "SELL") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["side"],
        message: "SELL_LIMIT phải có side SELL",
      });
    }

    if (
      data.orderType !== "MARKET" &&
      (!data.price || Number(data.price) <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "Limit order phải có price",
      });
    }
  });

export const closePositionSchema = z.object({
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, {
      message: "Quantity phải là số dương",
    })
    .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
      message: "Quantity phải lớn hơn 0",
    })
    .optional(),
});
export type ClosePositionInput = z.infer<typeof closePositionSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
