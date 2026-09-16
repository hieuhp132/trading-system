import "dotenv/config";

import app from "./app";

const port = Number(process.env.PORT ?? 4000);

const server = app.listen(port, () => {
  console.log(`Trading System API running on http://localhost:${port}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received. Shutting down...`);

  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
