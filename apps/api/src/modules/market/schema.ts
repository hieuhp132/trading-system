import { z } from "zod";
export const getMarketPriceSchema = z.object({
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .default("XAUUSD")
    .refine((value) => value === "XAUUSD", {
      message: "Hiện tại hệ thống chỉ hỗ trợ XAUUSD",
    }),
});
export type GetMarketPriceInput = z.infer<typeof getMarketPriceSchema>;
