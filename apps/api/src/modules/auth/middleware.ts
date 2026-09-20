import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { verifyAccessToken } from "../../common/utils/jwt.js";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    next(new AppError("Cần có access token", 401, "UNAUTHORIZED"));
    return;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(
      new AppError(
        "Authorization header không hợp lệ. Thiếu Bearer hoặc token",
        401,
        "INVALID_AUTHORIZATION_HEADER",
      ),
    );
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    _res.locals.auth = payload;
    next();
  } catch {
    next(
      new AppError(
        "access token ko hợp lệ hoặc hết hạn",
        401,
        "INVALID_ACCESS_TOKEN",
      ),
    );
  }
};
