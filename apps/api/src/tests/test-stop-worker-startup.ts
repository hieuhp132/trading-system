import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (new URL(databaseUrl).pathname !== "/gold_trading_test") {
  throw new Error("Refusing to run outside gold_trading_test");
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("NODE_ENV must be test");
}

let passed = 0;
let failed = 0;

async function freePort(): Promise<number> {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to allocate port");
  }

  const port = address.port;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  return port;
}

function launch(
  port: number,
  stopEnabled: boolean,
): { child: ChildProcess; output: () => string } {
  let logs = "";

  const child = spawn(process.execPath, ["dist/main.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      STOP_WORKER_ENABLED: String(stopEnabled),
      LIMIT_WORKER_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });

  return { child, output: () => logs };
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(50);
  }

  throw new Error("Timed out waiting for expected condition");
}

async function cleanup(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  // Cleanup only. This is NOT a graceful-shutdown assertion.
  child.kill();

  await Promise.race([once(child, "exit").then(() => undefined), delay(3000)]);
}

async function run(name: string, test: () => Promise<void>): Promise<void> {
  try {
    await test();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${name}`, error);
  }
}

async function main(): Promise<void> {
  await run("Worker disabled: API starts without Stop Worker", async () => {
    const port = await freePort();
    const processUnderTest = launch(port, false);

    try {
      try {
        await waitFor(() =>
  processUnderTest.output().includes("SL/TP stop worker disabled"),
);
      } catch (error) {
        console.error("=== CHILD PROCESS LOGS ===");
        console.error(processUnderTest.output());
        console.error("Exit code:", processUnderTest.child.exitCode);
        console.error("Signal:", processUnderTest.child.signalCode);
        throw error;
      }

      const response = await fetch(`http://127.0.0.1:${port}/`);

      assert.equal(response.status, 200);
      assert.doesNotMatch(
        processUnderTest.output(),
        /SL\/TP stop worker started/,
      );
    } finally {
      await cleanup(processUnderTest.child);
    }
  });

  await run("Occupied port: Stop Worker does not start", async () => {
    const blocker = createServer();
    blocker.listen({ port: 0, host: "::", ipv6Only: false });
    await once(blocker, "listening");

    const address = blocker.address();

    if (!address || typeof address === "string") {
      throw new Error("Unable to read occupied port");
    }

    const processUnderTest = launch(address.port, true);

    try {
      // HTTP startup must fail because the port is occupied.
      await waitFor(
        () => processUnderTest.output().includes("EADDRINUSE"),
      );

      // The HTTP error must initiate and complete graceful shutdown.
      await waitFor(
        () => processUnderTest.output().includes("Shutdown completed"),
      );

      // Poll process state: the child might exit before a listener is attached.
      await waitFor(
        () =>
          processUnderTest.child.exitCode !== null ||
          processUnderTest.child.signalCode !== null,
      );

      const logs = processUnderTest.output();

      assert.match(logs, /HTTP_SERVER_ERROR received\. Shutting down\.\.\./);
      assert.match(logs, /PostgreSQL connection closed/);
      assert.match(logs, /Shutdown completed/);

      assert.doesNotMatch(
        logs,
        /SL\/TP stop worker started/,
      );

      assert.equal(processUnderTest.child.signalCode, null);
      assert.notEqual(processUnderTest.child.exitCode, 0);
      assert.notEqual(processUnderTest.child.exitCode, null);
    } catch (error) {
      console.error("=== CHILD PROCESS LOGS ===");
      console.error(processUnderTest.output());
      console.error("Exit code:", processUnderTest.child.exitCode);
      console.error("Signal:", processUnderTest.child.signalCode);
      throw error;
    } finally {
      await cleanup(processUnderTest.child);

      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  console.log(`RESULT: passed=${passed} failed=${failed}`);

  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
