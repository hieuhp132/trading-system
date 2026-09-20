import { Router } from "express";

import { asyncHandler } from "../../common/utils/async-handler.js";
import { validate } from "../../common/validators/validate.js";

import { loginSchema, registerSchema } from "./schema.js";

import {
  loginController,
  meController,
  registerController,
} from "./controller.js";

import { requireAuth } from "./middleware.js";

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
