import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";

import type { Contract } from "../../prisma/contract.js";
import contractJson from "../../prisma/contract.json" with { type: "json" };

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

export const db = postgres<Contract>({
  contractJson,
  url: databaseUrl,
});
