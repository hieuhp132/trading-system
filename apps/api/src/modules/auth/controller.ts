import type { Request, Response } from "express";
import { getAuthenticatedUser, login, register } from "./service";

export async function registerController(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await register(req.body);
  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function loginController(
  req: Request,
  res: Response,
): Promise<void> {
  const result = await login(req.body);
  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function meController(
  _req: Request,
  res: Response,
): Promise<void> {
  const userId = res.locals.auth.sub;
  const user = await getAuthenticatedUser(userId);
  res.status(200).json({
    success: true,
    data: user,
  });
}
