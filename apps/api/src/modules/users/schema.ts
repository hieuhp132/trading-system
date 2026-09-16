import { z } from "zod";

export const updateCurrentUserSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Họ tên phải có ít nhất 2 ký tự")
      .max(100, "Họ tên ko được vượt quá 100 ký tự")
      .optional(),
  })
  .strict();

export const userIdParamSchema = z.object({
  id: z.string().uuid("User id ko hợp lệ"),
});

export type UpdateCurrentUserInput = z.infer<typeof updateCurrentUserSchema>;
