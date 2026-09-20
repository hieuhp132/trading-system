import type { Request, Response } from "express";

import { getCurrentUser } from "./service.js";

export async function getCurrentUserController(
  _req: Request,
  res: Response,
): Promise<void> {
  const userId = res.locals.auth.sub;

  const user = await getCurrentUser(userId);

  res.status(200).json({
    success: true,
    data: user,
  });
}
