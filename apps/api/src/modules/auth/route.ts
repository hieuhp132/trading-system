import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../common/validators/validate";

import { loginSchema, registerSchema } from "./schema";

import {
  loginController,
  meController,
  registerController,
} from "./controller";

import { requireAuth } from "./middleware";

const router = Router();

router.post(
  "/register",
  validate({ body: registerSchema }),
  asyncHandler(registerController),
);

router.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(loginController),
);

router.get("/me", requireAuth, asyncHandler(meController));

export default router;
