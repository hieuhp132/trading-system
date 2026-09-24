import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

const port =
  Number(process.env.SSE_RUNTIME_PORT);

const databaseUrl =
  process.env.SSE_RUNTIME_DATABASE_URL;

if (
  !Number.isInteger(port) ||
  port <= 0
) {
  throw new Error(
    "SSE_RUNTIME_PORT is required",
  );
}

if (!databaseUrl) {
  throw new Error(
    "SSE_RUNTIME_DATABASE_URL is required",
  );
}

const apiRoot =
  `http://127.0.0.1:${port}`;

let stdout = "";
let stderr = "";

const child =
  spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,

        PORT:
          String(port),

        DATABASE_URL:
          databaseUrl,

        TEST_DATABASE_URL:
          databaseUrl,

        MARKET_DATA_PROVIDER:
          "demo",

        LIMIT_WORKER_ENABLED:
          "false",

        STOP_WORKER_ENABLED:
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

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", (chunk: string) => {
  stdout += chunk;
});

child.stderr.on("data", (chunk: string) => {
  stderr += chunk;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const startedAt =
    Date.now();

  while (
    Date.now() - startedAt < timeoutMs
  ) {
    if (predicate()) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(
        `Child exited while waiting for ${label}.\n` +
        `stdout:\n${stdout}\n` +
        `stderr:\n${stderr}`,
      );
    }

    await sleep(50);
  }

  throw new Error(
    `Timed out waiting for ${label}.\n` +
    `stdout:\n${stdout}\n` +
    `stderr:\n${stderr}`,
  );
}

async function stopChild(): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  /*
   * Windows does not reliably deliver POSIX SIGTERM
   * through child.kill() to Node's signal handler.
   *
   * Runtime graceful-signal semantics are already
   * covered separately by static lifecycle tests.
   */
  if (process.platform === "win32") {
    child.kill();

    await sleep(250);

    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }

    return;
  }

  child.kill("SIGTERM");

  await waitFor(
    () => child.exitCode !== null,
    5_000,
    "child shutdown",
  );
}

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

try {
  /*
   * 1. Real process starts on isolated port.
   */
  await waitFor(
    () =>
      stdout.includes(
        `Trading System API running on http://localhost:${port}`,
      ),
    10_000,
    "HTTP listen",
  );

  pass("isolated child API is listening");

  /*
   * 2. Reference feed warm-up happens.
   */
  await waitFor(
    () =>
      stdout.includes(
        "Reference quote feed warmed up",
      ),
    10_000,
    "reference feed warm-up",
  );

  pass("reference feed warm-up completed");

  /*
   * 3. Trading workers remain disabled.
   */
  const disabledWorkerLogs = [
    "SL/TP stop worker disabled",
    "Limit worker disabled",
    "Stop-Out worker disabled",
  ] as const;

  for (const expectedLog of disabledWorkerLogs) {
    assert.ok(
      stdout.includes(expectedLog),
      `Missing worker lifecycle log: ${expectedLog}

stdout:
${stdout}

stderr:
${stderr}`,
    );
  }

  pass("all trading workers are disabled");
  /*
   * 4. Existing HTTP price route remains healthy.
   */
  const priceResponse =
    await fetch(
      `${apiRoot}/api/v1/market/price?symbol=XAUUSD`,
    );

  assert.equal(
    priceResponse.status,
    200,
  );

  const pricePayload =
    await priceResponse.json() as {
      success: boolean;
      data: {
        symbol: string;
        metadata: {
          executable: boolean;
        };
      };
    };

  assert.equal(
    pricePayload.success,
    true,
  );

  assert.equal(
    pricePayload.data.symbol,
    "XAUUSD",
  );

  assert.equal(
    pricePayload.data.metadata.executable,
    true,
  );

  pass("existing HTTP market price remains healthy");

  /*
   * 5. Open a real HTTP SSE connection.
   */
  const abortController =
    new AbortController();

  const sseResponse =
    await fetch(
      `${apiRoot}/api/v1/market/stream?symbol=XAUUSD`,
      {
        headers: {
          Accept: "text/event-stream",
        },

        signal:
          abortController.signal,
      },
    );

  assert.equal(
    sseResponse.status,
    200,
  );

  const contentType =
    sseResponse.headers.get(
      "content-type",
    );

  assert.ok(
    contentType?.startsWith(
      "text/event-stream",
    ),
  );

  assert.equal(
    sseResponse.headers.get(
      "cache-control",
    ),
    "no-cache, no-transform",
  );

  pass("real SSE response headers are correct");

  assert.ok(
    sseResponse.body,
  );

  /*
   * 6. Read first real SSE quote event.
   */
  const reader =
    sseResponse.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";

  const eventDeadline =
    Date.now() + 5_000;

  while (
    !buffer.includes("\n\n") &&
    Date.now() < eventDeadline
  ) {
    const result =
      await reader.read();

    if (result.done) {
      break;
    }

    buffer +=
      decoder.decode(
        result.value,
        { stream: true },
      );
  }

  const eventEnd =
    buffer.indexOf("\n\n");

  assert.ok(
    eventEnd >= 0,
    `No complete SSE event received: ${buffer}`,
  );

  const firstEvent =
    buffer.slice(
      0,
      eventEnd,
    );

  const lines =
    firstEvent.split("\n");

  assert.equal(
    lines[0],
    "event: quote",
  );

  const dataLine =
    lines.find((line) =>
      line.startsWith("data: "),
    );

  assert.ok(dataLine);

  const eventPayload =
    JSON.parse(
      dataLine.slice("data: ".length),
    ) as {
      symbol: string;
      timestamp: string;
      metadata: {
        receivedAt: string;
        bidAskType: string;
        executable: boolean;
      };
      executionCapability?: unknown;
    };

  assert.equal(
    eventPayload.symbol,
    "XAUUSD",
  );

  assert.equal(
    eventPayload.timestamp,
    eventPayload.metadata.receivedAt,
  );

  assert.equal(
    eventPayload.metadata.bidAskType,
    "SYNTHETIC",
  );

  assert.equal(
    eventPayload.metadata.executable,
    true,
  );

  assert.equal(
    "executionCapability" in eventPayload,
    false,
  );

  pass("real SSE quote event matches delivery contract");

  /*
   * 7. Disconnect the SSE client.
   */
  abortController.abort();

  try {
    await reader.cancel();
  }
  catch {
    // Abort/cancel race is harmless here.
  }

  await sleep(500);

  /*
   * API must remain alive after one SSE client disconnects.
   */
  const healthResponse =
    await fetch(
      `${apiRoot}/api/v1/health`,
    );

  assert.equal(
    healthResponse.status,
    200,
  );

  pass("SSE client disconnect does not affect API process");

  /*
   * 8. No obvious runtime lifecycle errors.
   */
  assert.equal(
    child.exitCode,
    null,
  );

  assert.equal(
    stderr.includes(
      "UnhandledPromiseRejection",
    ),
    false,
  );

  assert.equal(
    stderr.includes(
      "ERR_STREAM_WRITE_AFTER_END",
    ),
    false,
  );

  pass("runtime has no stream lifecycle error");

  console.log("");
  console.log(
    `[PASS] Reference SSE Runtime: ${passed}/8 checks`,
  );
}
finally {
  await stopChild();
}
