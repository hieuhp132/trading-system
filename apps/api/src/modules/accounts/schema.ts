import { z } from "zod";

export const createDemoAccountSchema = z.object({
  initialBalance: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, {
      message: "Initial balance phải là số dương",
    })
    .refine((value) => Number(value) > 0, {
      message: "Initial balance phải lớn hơn 0",
    })
    .optional(),

  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "USD", {
      message: "Hiện tại tài khoản demo chỉ hỗ trợ USD",
    })
    .optional(),

  maxLeverage: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, {
      message: "Leverage phải là số dương",
    })
    .refine((value) => Number(value) > 0, {
      message: "Leverage phải lớn hơn 0",
    })
    .optional(),
});

export type CreateDemoAccountInput = z.infer<typeof createDemoAccountSchema>;
