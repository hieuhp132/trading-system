import { z } from "zod";
export const createOrderSchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "XAUUSD", {
      message: "Hiện tại hệ thống chỉ hỗ trợ XAUUSD",
    }),
  side: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET"]).default("MARKET"),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, { message: "Quantity phải là số dương" })
    .refine((value) => Number(value) > 0, {
      message: "Quantity phải lớn hơn 0",
    }),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
