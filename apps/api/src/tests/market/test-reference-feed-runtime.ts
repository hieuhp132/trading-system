import assert from "node:assert/strict";
import {
  spawn,
  type ChildProcessByStdio,
} from "node:child_process";
import type {
  Readable,
} from "node:stream";
import {
  createServer,
} from "node:net";
import {
  once,
} from "node:events";
import {
  setTimeout as delay,
} from "node:timers/promises";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";

const here =
  dirname(fileURLToPath(import.meta.url));

const apiRoot =
  resolve(
    here,
    "../../..",
  );

const databaseUrl =
  process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required",
  );
}

const databaseName =
  new URL(databaseUrl)
    .pathname
    .replace(/^\//, "");

if (databaseName !== "gold_trading_test") {
  throw new Error(
    `SAFETY ABORT: expected gold_trading_test; got ${databaseName}`,
  );
}

async function reservePort(): Promise<number> {
  const server =
    createServer();

  server.listen(
    0,
    "127.0.0.1",
  );

  await once(
    server,
    "listening",
  );

  const address =
    server.address();

  assert.ok(
    address &&
      typeof address === "object",
  );

  const port =
    address.port;

  await new Promise<void>(
    (resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
        } else {
          resolveClose();
        }
      });
    },
  );

  return port;
}

function launch(
  port: number,
): {
  child: ChildProcessByStdio<null, Readable, Readable>;
  output(): string;
} {
  let logs = "";

  const child =
    spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/main.ts",
      ],
      {
        cwd: apiRoot,
        env: {
          ...process.env,

          NODE_ENV: "test",
          PORT: String(port),

          DATABASE_URL:
            databaseUrl,

          TEST_DATABASE_URL:
            databaseUrl,

          MARKET_DATA_PROVIDER:
            "demo",

          STOP_WORKER_ENABLED:
            "false",

          LIMIT_WORKER_ENABLED:
            "false",

          STOP_OUT_WORKER_ENABLED:
            "false",
        },
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      },
    );

  const append =
    (chunk: Buffer | string) => {
      logs += chunk.toString();
    };

  child.stdout.on(
    "data",
    append,
  );

  child.stderr.on(
    "data",
    append,
  );

  return {
    child,
    output: () => logs,
  };
}

async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 10_000,
): Promise<void> {
  const started =
    Date.now();

  while (
    Date.now() - started <
    timeoutMs
  ) {
    if (predicate()) {
      return;
    }

    await delay(50);
  }

  throw new Error(
    `Timed out waiting for ${description}`,
  );
}

async function waitForExit(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 10_000,
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  if (
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return {
      code: child.exitCode,
      signal: child.signalCode,
    };
  }

  return await Promise.race([
    once(
      child,
      "exit",
    ).then(([code, signal]) => ({
      code:
        code as number | null,
      signal:
        signal as NodeJS.Signals | null,
    })),

    delay(timeoutMs).then(() => {
      throw new Error(
        "Timed out waiting for child exit",
      );
    }),
  ]);
}

async function cleanup(
  child: ChildProcessByStdio<null, Readable, Readable>,
): Promise<void> {
  if (
    child.exitCode !== null ||
    child.signalCode !== null
  ) {
    return;
  }

  child.kill("SIGTERM");

  try {
    await waitForExit(
      child,
      3_000,
    );
  } catch {
    child.kill("SIGKILL");

    await waitForExit(
      child,
      3_000,
    ).catch(
      () => undefined,
    );
  }
}

const port =
  await reservePort();

const processUnderTest =
  launch(port);

try {
  await waitFor(
    () =>
      processUnderTest
        .output()
        .includes(
          `Trading System API running on http://localhost:${port}`,
        ),
    "HTTP listen",
  );

  console.log(
    "[PASS] child API listened on isolated dynamic port",
  );

  await waitFor(
    () =>
      processUnderTest
        .output()
        .includes(
          "Reference quote feed warmed up",
        ),
    "reference feed warm-up",
  );

  console.log(
    "[PASS] reference feed warm-up completed",
  );

  await waitFor(
    () =>
      processUnderTest
        .output()
        .includes(
          "Reference quote feed started",
        ),
    "reference feed start",
  );

  console.log(
    "[PASS] reference feed timer started",
  );

  const runningLogs =
    processUnderTest.output();

  assert.match(
    runningLogs,
    /SL\/TP stop worker disabled/,
  );

  assert.match(
    runningLogs,
    /Limit worker disabled/,
  );

  assert.match(
    runningLogs,
    /Stop-Out worker disabled/,
  );

  console.log(
    "[PASS] all trading workers remained disabled",
  );

  assert.doesNotMatch(
    runningLogs,
    /Reference quote feed warm-up failed:/,
  );

  assert.doesNotMatch(
    runningLogs,
    /HTTP server error:/,
  );

  console.log(
    "[PASS] startup completed without lifecycle errors",
  );

  /*
   * We deliberately do not call DB-backed endpoints.
   * The runtime test only exercises:
   * listen -> demo feed warm-up -> timer -> SIGTERM.
   */

  let gracefulShutdownVerified =
    false;

  if (process.platform === "win32") {
    /*
     * Node child.kill("SIGTERM") on Windows terminates the child
     * without delivering the POSIX-style SIGTERM event to the
     * child process handler.
     *
     * Startup lifecycle is runtime-tested above.
     * Graceful shutdown ordering remains covered by the static
     * lifecycle regression.
     */
    console.log(
      "[SKIP] graceful SIGTERM runtime assertion on Windows",
    );

    console.log(
      "[SKIP] graceful shutdown ordering is covered by static lifecycle regression",
    );
  } else {
    const killAccepted =
      processUnderTest.child.kill(
        "SIGTERM",
      );

    assert.equal(
      killAccepted,
      true,
      "SIGTERM should be accepted",
    );

    await waitFor(
      () =>
        processUnderTest
          .output()
          .includes(
            "SIGTERM received. Shutting down...",
          ),
      "SIGTERM shutdown",
    );

    console.log(
      "[PASS] SIGTERM entered graceful shutdown",
    );

    await waitFor(
      () =>
        processUnderTest
          .output()
          .includes(
            "Shutdown completed",
          ),
      "shutdown completion",
    );

    const result =
      await waitForExit(
        processUnderTest.child,
      );

    assert.equal(
      result.code,
      0,
      `child exited unexpectedly:
${processUnderTest.output()}`,
    );

    gracefulShutdownVerified =
      true;

    console.log(
      "[PASS] graceful shutdown completed cleanly",
    );

    console.log(
      "[PASS] child exit code = 0",
    );
  }
  if (gracefulShutdownVerified) {
    const finalLogs =
      processUnderTest.output();

    assert.match(
      finalLogs,
      /PostgreSQL connection closed/,
    );

    assert.match(
      finalLogs,
      /Shutdown completed/,
    );

    assert.doesNotMatch(
      finalLogs,
      /Shutdown failed:/,
    );

    assert.doesNotMatch(
      finalLogs,
      /Failed to close PostgreSQL:/,
    );
  }

  console.log("");

  if (process.platform === "win32") {
    console.log(
      "[PASS] Reference Feed Runtime Startup: 5/5",
    );

    console.log(
      "[SKIP] Runtime graceful SIGTERM: Windows child-process limitation",
    );
  } else {
    console.log(
      "[PASS] Reference Feed Runtime Lifecycle: 8/8",
    );
  }
}
finally {
  await cleanup(
    processUnderTest.child,
  );
}
