import type { Request, Response } from "express";

import { getHealthStatus } from "./service";

export async function healthController(
  _req: Request,
  res: Response,
): Promise<void> {
  const health = await getHealthStatus();

  const statusCode = health.status === "ok" ? 200 : 503;

  res.status(statusCode).json(health);
}
