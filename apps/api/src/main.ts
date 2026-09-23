import "dotenv/config";

import app from "./app.js";

import { db } from "./database/prisma.js";
import { createStopWorker } from "./modules/orders/stop-worker.js";
import { createLimitWorker } from "./modules/orders/limit-worker.js";

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 100) {
    throw new Error(`${name} must be an integer >= 100`);
  }

  return value;
}

function isEnabled(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

const port = Number(process.env.PORT ?? 4000);

// --------------------------------------------------
// Stop Worker
// --------------------------------------------------

const stopWorker = isEnabled("STOP_WORKER_ENABLED")
  ? createStopWorker(undefined, {
      intervalMs: readPositiveInteger("STOP_WORKER_INTERVAL_MS", 1000),
      maxQuoteAgeMs: readPositiveInteger("STOP_WORKER_MAX_QUOTE_AGE_MS", 5000),
    })
  : null;

// --------------------------------------------------
// Limit Worker
// --------------------------------------------------

const limitWorker = isEnabled("LIMIT_WORKER_ENABLED")
  ? createLimitWorker(undefined, {
      intervalMs: readPositiveInteger("LIMIT_WORKER_INTERVAL_MS", 1000),
      maxQuoteAgeMs: readPositiveInteger("LIMIT_WORKER_MAX_QUOTE_AGE_MS", 5000),
    })
  : null;

// --------------------------------------------------
// HTTP Server
// --------------------------------------------------

let shuttingDown = false;

const server = app.listen(port, () => {
  console.log(`Trading System API running on http://localhost:${port}`);

  if (stopWorker && !shuttingDown) {
    stopWorker.start();

    console.log("SL/TP stop worker started");
  } else {
    console.log("SL/TP stop worker disabled");
  }

  if (limitWorker && !shuttingDown) {
    limitWorker.start();

    console.log("Limit worker started");
  } else {
    console.log("Limit worker disabled");
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error("HTTP server error:", error);

  process.exitCode = 1;

  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use`);
  }

  void shutdown("HTTP_SERVER_ERROR");
});

// --------------------------------------------------
// Graceful Shutdown
// --------------------------------------------------

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  const httpClosed = new Promise<void>((resolve, reject) => {
    // A server that never started listening does not need closing.
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });

  // Wait until HTTP and both workers have stopped
  // before closing the shared database connection.
  const results = await Promise.allSettled([
    stopWorker?.stop() ?? Promise.resolve(),
    limitWorker?.stop() ?? Promise.resolve(),
    httpClosed,
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Shutdown failed:", result.reason);
      process.exitCode = 1;
    }
  }

  try {
    await db.close();
    console.log("PostgreSQL connection closed");
  } catch (error) {
    console.error("Failed to close PostgreSQL:", error);
    process.exitCode = 1;
  }

  console.log("Shutdown completed");
}


process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
