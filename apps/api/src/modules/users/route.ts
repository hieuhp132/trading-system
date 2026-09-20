import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler.js";
import { requireAuth } from "../auth/middleware.js";

import { getCurrentUserController } from "./controller.js";

const router = Router();

router.get("/me", requireAuth, asyncHandler(getCurrentUserController));

export default router;
