const databaseUrl = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_ACCESS_SECRET;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,

  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "1d",
  },
} as const;
