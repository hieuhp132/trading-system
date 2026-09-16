import { db } from "../../database/prisma";

export async function getHealthStatus() {
  const startedAt = Date.now();

  try {
    const result = await db.orm.public.User.aggregate((aggregate) => ({
      total: aggregate.count(),
    }));

    return {
      status: "ok" as const,
      database: "connected" as const,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
      userCount: result.total,
    };
  } catch (error) {
    console.error("[Health] Database check failed:", error);

    return {
      status: "degraded" as const,
      database: "disconnected" as const,
      timestamp: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
    };
  }
}
