import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  spawnSync,
} from "node:child_process";
import {
  fileURLToPath,
} from "node:url";

type Scenario =
  | "demo"
  | "twelve";

const scenario =
  process.argv[2] as Scenario | undefined;

async function runDemo(): Promise<void> {
  process.env.MARKET_DATA_PROVIDER = "demo";

  let fetchCalls = 0;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCalls += 1;

    throw new Error(
      "NETWORK_CALL_FORBIDDEN_IN_DEMO_REFERENCE_TEST",
    );
  };

  try {
    const {
      getCachedReferenceQuote,
      getReferenceQuote,
    } = await import("./service.js");

    assert.equal(
      getCachedReferenceQuote("XAUUSD"),
      null,
      "cache must initially be empty",
    );

    const quote =
      await getReferenceQuote("XAUUSD");

    assert.equal(quote.symbol, "XAUUSD");
    assert.equal(quote.source, "demo");

    assert.equal(
      quote.executionCapability,
      "PAPER",
    );

    assert.equal(
      quote.bidAskType,
      "SYNTHETIC",
    );

    assert.equal(
      quote.sourceTimestamp,
      null,
    );

    assert.equal(
      "timestamp" in quote,
      false,
      "ReferenceQuote must not expose legacy execution timestamp",
    );

    const cached =
      getCachedReferenceQuote(" xauusd ");

    assert.ok(cached);

    assert.deepEqual(
      cached,
      quote,
      "cache must contain latest reference quote",
    );

    assert.notEqual(
      cached,
      quote,
      "cache read must return a defensive copy",
    );

    assert.equal(
      fetchCalls,
      0,
      "demo reference path must not use fetch",
    );

    console.log(
      "[PASS] demo reference quote created",
    );

    console.log(
      "[PASS] demo reference quote cached",
    );

    console.log(
      "[PASS] ReferenceQuote has no compatibility timestamp",
    );

    console.log(
      "[PASS] demo network calls = 0",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runTwelve(): Promise<void> {
  process.env.MARKET_DATA_PROVIDER =
    "twelve-data";

  const tempDir =
    await mkdtemp(
      join(tmpdir(), "reference-service-twelve-"),
    );

  const budgetFile =
    join(tempDir, "budget.json");

  const now = Date.now();

  await writeFile(
    budgetFile,
    JSON.stringify({
      minuteWindow:
        Math.floor(now / 60_000),
      minuteCredits: 0,
      utcDay:
        new Date(now)
          .toISOString()
          .slice(0, 10),
      dailyCredits: 0,
    }),
    "utf8",
  );

  process.env.TWELVE_DATA_BUDGET_FILE =
    budgetFile;

  /*
   * Reference data is allowed to reach the Twelve provider.
   * Replace fetch completely so this regression cannot perform
   * a real external request.
   */
  let fetchCalls = 0;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCalls += 1;

    /*
     * Deliberately return a controlled provider response.
     * If the provider expects another Twelve endpoint shape,
     * this scenario may fail safely without network access.
     */
    return new Response(
      JSON.stringify({
        price: "3651.30",
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  try {
    const {
      getCachedReferenceQuote,
      getReferenceQuote,
    } = await import("./service.js");

    let quote;

    try {
      quote =
        await getReferenceQuote("XAUUSD");
    } catch (error) {
      /*
       * Never hide provider-contract mismatches.
       * The fetch trap guarantees this is still offline.
       */
      console.error(
        "[FAIL] mocked Twelve response did not satisfy provider contract",
      );

      throw error;
    }

    assert.equal(
      fetchCalls,
      1,
      "reference path should call mocked Twelve provider once",
    );

    assert.equal(
      quote.symbol,
      "XAUUSD",
    );

    assert.equal(
      quote.source,
      "twelve-data",
    );

    assert.equal(
      quote.executionCapability,
      "NONE",
      "Twelve reference quote must remain non-executable",
    );

    assert.equal(
      quote.bidAskType,
      "SYNTHETIC",
    );

    assert.equal(
      quote.sourceTimestamp,
      null,
    );

    assert.equal(
      "timestamp" in quote,
      false,
    );

    const cached =
      getCachedReferenceQuote("XAUUSD");

    assert.ok(cached);

    assert.deepEqual(
      cached,
      quote,
    );

    console.log(
      "[PASS] Twelve reference path uses mocked provider",
    );

    console.log(
      "[PASS] Twelve reference capability = NONE",
    );

    console.log(
      "[PASS] Twelve reference quote cached",
    );

    console.log(
      `[PASS] mocked Twelve fetch calls = ${fetchCalls}`,
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.TWELVE_DATA_BUDGET_FILE;

    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

function runParent(): void {
  const currentFile =
    fileURLToPath(import.meta.url);

  const scenarios: Scenario[] = [
    "demo",
    "twelve",
  ];

  for (const selected of scenarios) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        currentFile,
        selected,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,

          MARKET_DATA_PROVIDER:
            selected === "demo"
              ? "demo"
              : "twelve-data",

          LIMIT_WORKER_ENABLED:
            "false",

          STOP_WORKER_ENABLED:
            "false",

          STOP_OUT_WORKER_ENABLED:
            "false",

          TWELVE_DATA_API_KEY:
            "offline-reference-service-test",
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
      `${selected} reference child failed`,
    );
  }

  console.log("");
  console.log(
    "[PASS] Reference Service Regression: 2/2 scenarios",
  );
}

if (scenario === "demo") {
  await runDemo();
} else if (scenario === "twelve") {
  await runTwelve();
} else {
  runParent();
}
