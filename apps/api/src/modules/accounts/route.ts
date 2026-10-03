import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import { asyncHandler } from "../../common/utils/async-handler.js";
import {
  createDemo,
  getAccount,
  getAccountBalance,
  getAccountBalanceHistory,
  getAccountTradingConditions,
} from "./controller.js";

const router = Router();

router.use(requireAuth);

router.post("/demo", asyncHandler(createDemo));

router.get("/", asyncHandler(getAccount));

router.get("/balance", asyncHandler(getAccountBalance));
router.get("/balance-history", asyncHandler(getAccountBalanceHistory));
router.get("/trading-conditions", asyncHandler(getAccountTradingConditions));
export default router;
