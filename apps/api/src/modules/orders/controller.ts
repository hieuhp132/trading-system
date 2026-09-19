import type { Request, Response } from "express";

import { createOrderSchema, closePositionSchema } from "./schema";

import {
  createMarketOrder,
  getMyOrder,
  getMyOrders,
  getMyPosition,
  getMyPositions,
  getMyTrades,
  getMyPortfolioSummary,
  closePosition,
} from "./service";

function getParam(req: Request, name: string): string {
  const value = req.params[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const input = createOrderSchema.parse(req.body);

  const result = await createMarketOrder(res.locals.auth.sub, input);

  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function getOrders(_req: Request, res: Response): Promise<void> {
  const result = await getMyOrders(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const result = await getMyOrder(res.locals.auth.sub, getParam(req, "id"));

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getPositions(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await getMyPositions(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getPosition(req: Request, res: Response): Promise<void> {
  const result = await getMyPosition(res.locals.auth.sub, getParam(req, "id"));

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getTrades(_req: Request, res: Response): Promise<void> {
  const result = await getMyTrades(res.locals.auth.sub);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function closePositionController(
  req: Request,
  res: Response,
): Promise<void> {
  const input = closePositionSchema.parse(req.body ?? {});

  const result = await closePosition(
    res.locals.auth.sub,
    getParam(req, "positionId"),
    input.quantity,
  );

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getPortfolioSummary(
  _req: Request,
  res: Response,
): Promise<void> {
  const result = await getMyPortfolioSummary(res.locals.auth.sub);
  res.status(200).json({ success: true, data: result });
}
