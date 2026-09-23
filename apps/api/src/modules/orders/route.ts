import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import {
  createOrder,
  getOrder,
  getOrders,
  getPosition,
  getPositions,
  getTrades,
  getPortfolioSummary,
  closePositionController,
  updatePositionStopsController,
  cancelOrderController,
} from "./controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(getOrders));
router.get("/portfolio/summary", asyncHandler(getPortfolioSummary));
router.get("/positions", asyncHandler(getPositions));
router.get("/positions/:id", asyncHandler(getPosition));
router.get("/trades", asyncHandler(getTrades));
router.get("/:id", asyncHandler(getOrder));
router.post("/:id/cancel", asyncHandler(cancelOrderController));
router.post("/", asyncHandler(createOrder));
router.post(
  "/positions/:positionId/close",
  asyncHandler(closePositionController),
);
router.patch(
  "/positions/:positionId/stops",
  asyncHandler(updatePositionStopsController),
);
export default router;
