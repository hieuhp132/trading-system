import type { Request, Response } from "express";

import {
  createDemoAccount,
  getMyAccount,
  getMyAccountBalance,
  getMyAccountTradingConditions,
} from "./service.js";

export async function createDemo(_req: Request, res: Response): Promise<void> {
  const account = await createDemoAccount(res.locals.auth.sub);

  res.status(201).json({
    success: true,
    data: account,
  });
}

export async function getAccount(_req: Request, res: Response): Promise<void> {
  const account = await getMyAccount(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: account,
  });
}

export async function getAccountBalance(
  _req: Request,
  res: Response,
): Promise<void> {
  const balance = await getMyAccountBalance(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: balance,
  });
}

export async function getAccountTradingConditions(
  _req: Request,
  res: Response,
): Promise<void> {
  const conditions = await getMyAccountTradingConditions(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: conditions,
  });
}
