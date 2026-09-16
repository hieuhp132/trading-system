import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { asyncHandler } from "../../common/utils/async-handler";
import {
  createOrder,
  getOrder,
  getOrders,
  getPosition,
  getPositions,
  getTrades,
  getPortfolioSummary,
} from "./controller";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(getOrders));
router.get("/portfolio/summary", asyncHandler(getPortfolioSummary));
router.get("/positions", asyncHandler(getPositions));
router.get("/positions/:id", asyncHandler(getPosition));
router.get("/trades", asyncHandler(getTrades));
router.get("/:id", asyncHandler(getOrder));
router.post("/", asyncHandler(createOrder));

export default router;
