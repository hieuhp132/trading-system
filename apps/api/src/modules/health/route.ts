import { Router } from "express";

import { healthController } from "./controller";
import { AppError } from "../../common/errors/app-error";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../common/validators/validate";

import { z } from "zod";

const testSchema = z.object({
  name: z.string().min(2),
  age: z.coerce.number().int().min(10),
});

const router = Router();

router.get("/", asyncHandler(healthController));
router.get("/error", () => {
  throw new AppError("This is a Test application error", 400, "TEST_ERROR");
});

router.post("/validate", validate({ body: testSchema }), (req, res) => {
  res.status(200).json({
    success: true,
    data: req.body,
  });
});
export default router;
