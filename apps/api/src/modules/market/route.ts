import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler.js";
import { getCandles, getPrice } from "./controller.js";

const router = Router();

router.get("/price", asyncHandler(getPrice));

router.get("/candles", asyncHandler(getCandles));

export default router;
