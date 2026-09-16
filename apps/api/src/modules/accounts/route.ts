import { Router } from "express";

import { requireAuth } from "../auth/middleware";

import { createDemo, getAccount, getAccountBalance } from "./controller";

const router = Router();

router.use(requireAuth);

router.post("/demo", createDemo);

router.get("/", getAccount);

router.get("/balance", getAccountBalance);

export default router;
