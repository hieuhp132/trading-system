import "dotenv/config";

import app from "./app.js";
import { createStopWorker } from "./modules/orders/stop-worker.js";

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 100) {
    throw new Error(`${name} must be an integer >= 100`);
  }
  return value;
}

const port = Number(process.env.PORT ?? 4000);
const workerEnabled =
  process.env.STOP_WORKER_ENABLED?.trim().toLowerCase() === "true";
const worker = workerEnabled
  ? createStopWorker(undefined, {
      intervalMs: readPositiveInteger("STOP_WORKER_INTERVAL_MS", 1000),
      maxQuoteAgeMs: readPositiveInteger("STOP_WORKER_MAX_QUOTE_AGE_MS", 5000),
    })
  : null;

let shuttingDown = false;
const server = app.listen(port, () => {
  console.log(`Trading System API running on http://localhost:${port}`);
  if (worker && !shuttingDown) {
    worker.start();
    console.log("SL/TP stop worker started");
  } else {
    console.log("SL/TP stop worker disabled");
  }
});

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down...`);

  // Stop accepting new requests while waiting for the in-flight worker tick.
  const httpClosed = new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  const results = await Promise.allSettled([
    worker?.stop() ?? Promise.resolve(),
    httpClosed,
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Shutdown failed:", result.reason);
      process.exitCode = 1;
    }
  }
  console.log("HTTP server and SL/TP worker stopped");
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
