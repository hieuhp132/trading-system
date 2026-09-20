import { AppError } from "../../common/errors/app-error.js";
import { db } from "../../database/prisma.js";

export async function getCurrentUser(userId: string) {
  const user = await db.orm.public.User.first({
    id: userId,
  });
  if (!user) {
    throw new AppError("Người dùng ko tồn tại", 404, "USER_NOT_FOUND");
  }
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
