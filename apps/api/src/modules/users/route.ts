import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { requireAuth } from "../auth/middleware";

import { getCurrentUserController } from "./controller";

const router = Router();

router.get("/me", requireAuth, asyncHandler(getCurrentUserController));

export default router;
