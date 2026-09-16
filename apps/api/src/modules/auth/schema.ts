import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ").toLowerCase(),
  password: z
    .string()
    .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
    .max(100, "Mật khẩu không được vượt quá 100 ký tự"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Email ko hợp lệ").toLowerCase(),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
