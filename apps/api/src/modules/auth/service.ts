import { AppError } from "../../common/errors/app-error.js";
import { hashPassword, comparePassword } from "../../common/utils/password.js";
import { signAccessToken } from "../../common/utils/jwt.js";
import { db } from "../../database/prisma.js";

import type { LoginInput, RegisterInput } from "./schema.js";

import type { AuthResponse, AuthUser } from "./types.js";

function toAuthUser(user: {
  id: string;
  email: string;
  fullName: string | null;
  role: "USER" | "ADMIN";
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullname: user.fullName,
    role: user.role,
  };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
  const existingUser = await db.orm.public.User.first({
    email: input.email,
  });

  if (existingUser) {
    throw new AppError("Email đã được sử dụng", 409, "EMAIL_ALREADY_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await db.orm.public.User.create({
    email: input.email,
    passwordHash,
  });

  const authUser = toAuthUser(user);

  const accessToken = signAccessToken({
    sub: authUser.id,
    email: authUser.email,
    role: authUser.role,
  });

  return {
    user: authUser,
    accessToken,
  };
}

export async function login(input: LoginInput): Promise<AuthResponse> {
  const user = await db.orm.public.User.first({
    email: input.email,
  });

  if (!user) {
    throw new AppError(
      "Email hoặc mật khẩu không chính xác",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const isPasswordValid = await comparePassword(
    input.password,
    user.passwordHash,
  );

  if (!isPasswordValid) {
    throw new AppError(
      "Email hoặc mật khẩu không chính xác",
      401,
      "INVALID_CREDENTIALS",
    );
  }

  const authUser = toAuthUser(user);

  const accessToken = signAccessToken({
    sub: authUser.id,
    email: authUser.email,
    role: authUser.role,
  });

  return {
    user: authUser,
    accessToken,
  };
}

export async function getAuthenticatedUser(userId: string): Promise<AuthUser> {
  const user = await db.orm.public.User.first({
    id: userId,
  });

  if (!user) {
    throw new AppError("Người dùng không tồn tại", 404, "USER_NOT_FOUND");
  }

  return toAuthUser(user);
}
