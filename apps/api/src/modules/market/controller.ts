import type { Request, Response } from "express";
import { getMarketPrice } from "./service";
export async function getPrice(req: Request, res: Response): Promise<void> {
  const symbol =
    typeof req.query.symbol === "string" ? req.query.symbol : "XAUUSD";
  const price = await getMarketPrice(symbol);
  res.status(200).json({ success: true, data: price });
}
