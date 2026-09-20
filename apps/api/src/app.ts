import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { errorHandler } from "./common/errors/error-handler.js";
import { notFoundHandler } from "./common/middleware/not-found-handler.js";
import healthRouter from "./modules/health/route.js";
import authRouter from "./modules/auth/route.js";
import accountRouter from "./modules/accounts/route.js";
import marketRouter from "./modules/market/route.js";
import ordersRouter from "./modules/orders/route.js";

const app = express();

app.disable("x-powered-by");

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

app.get("/", (_req, res) => {
  res.json({
    name: "Trading System API",
    version: "1.0.0",
    status: "ok",
  });
});
const endpoint = "/api/v1";
app.use(`${endpoint}/health`, healthRouter);
app.use(`${endpoint}/auth`, authRouter);
app.use(`${endpoint}/accounts`, accountRouter);
app.use(`${endpoint}/market`, marketRouter);
app.use(`${endpoint}/orders`, ordersRouter);

// Phải đặt sau tất cả routes
app.use(notFoundHandler);
// Phải đặt cuối cùng
app.use(errorHandler);

export default app;
