import assert from "node:assert/strict";
import {
  spawnSync,
} from "node:child_process";
import {
  fileURLToPath,
} from "node:url";

const currentFile =
  fileURLToPath(import.meta.url);

function runScenario(
  scenario: string,
): void {
  const result =
    spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        currentFile,
        scenario,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          MARKET_DATA_PROVIDER: "demo",
        },
      },
    );

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  assert.equal(
    result.status,
    0,
    `scenario failed: ${scenario}`,
  );
}

async function runReferenceScenario(): Promise<void> {
  let fetchCalls = 0;

  globalThis.fetch =
    (async () => {
      fetchCalls += 1;

      throw new Error(
        "Unexpected network request",
      );
    }) as typeof fetch;

  const service =
    await import("./service.js");

  const feed =
    service.getReferenceQuoteFeed();

  assert.equal(
    feed.isRunning(),
    false,
    "service integration must not auto-start feed",
  );

  assert.equal(
    service.getCachedReferenceQuote("XAUUSD"),
    null,
  );

  const refreshed =
    await feed.refresh();

  assert.equal(
    refreshed.symbol,
    "XAUUSD",
  );

  assert.equal(
    refreshed.executionCapability,
    "PAPER",
  );

  assert.equal(
    "timestamp" in refreshed,
    false,
    "feed must cache pure ReferenceQuote",
  );

  const cached =
    service.getCachedReferenceQuote("XAUUSD");

  assert.ok(cached);

  assert.deepEqual(
    cached,
    refreshed,
  );

  assert.equal(
    fetchCalls,
    0,
  );

  console.log(
    "[PASS] service feed refresh populates shared reference cache",
  );
  console.log(
    "[PASS] service feed does not auto-start",
  );
  console.log(
    "[PASS] service feed preserves pure ReferenceQuote",
  );
  console.log(
    "[PASS] demo service feed network calls = 0",
  );
}

async function runExecutionScenario(): Promise<void> {
  let fetchCalls = 0;

  globalThis.fetch =
    (async () => {
      fetchCalls += 1;

      throw new Error(
        "Unexpected network request",
      );
    }) as typeof fetch;

  const service =
    await import("./service.js");

  const feed =
    service.getReferenceQuoteFeed();

  assert.equal(
    feed.isRunning(),
    false,
  );

  await feed.refresh();

  const reference =
    service.getCachedReferenceQuote("XAUUSD");

  assert.ok(reference);

  const execution =
    await service.getTradingQuote("XAUUSD");

  assert.equal(
    execution.executionCapability,
    "PAPER",
  );

  assert.equal(
    execution.timestamp,
    execution.receivedAt,
  );

  assert.equal(
    fetchCalls,
    0,
  );

  console.log(
    "[PASS] execution boundary remains independent from reference feed",
  );
  console.log(
    "[PASS] execution still returns ExecutionQuote compatibility timestamp",
  );
  console.log(
    "[PASS] execution scenario network calls = 0",
  );
}

const scenario =
  process.argv[2];

if (scenario === "reference") {
  await runReferenceScenario();
} else if (scenario === "execution") {
  await runExecutionScenario();
} else {
  runScenario("reference");
  runScenario("execution");

  console.log("");
  console.log(
    "[PASS] Reference Feed Service Integration: 2/2 scenarios",
  );
}
