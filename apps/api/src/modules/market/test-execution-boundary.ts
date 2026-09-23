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

async function runScenario(
  selected: Scenario,
): Promise<void> {
  process.env.MARKET_DATA_PROVIDER =
    selected === "demo"
      ? "demo"
      : "twelve-data";

  /*
   * Never allow this regression to reach the network.
   *
   * For demo this must remain unused.
   * For Twelve the execution guard must throw before
   * provider.getPrice(), therefore before fetch().
   */
  let fetchCalls = 0;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCalls += 1;

    throw new Error(
      "NETWORK_CALL_FORBIDDEN_IN_EXECUTION_BOUNDARY_TEST",
    );
  };

  try {
    /*
     * Import only AFTER MARKET_DATA_PROVIDER is configured because
     * market/service.ts constructs its provider at module load.
     */
    const {
      getTradingQuote,
    } = await import("./service.js");

    if (selected === "demo") {
      const quote =
        await getTradingQuote("XAUUSD");

      assert.equal(
        quote.symbol,
        "XAUUSD",
      );

      assert.equal(
        quote.source,
        "demo",
      );

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
        quote.timestamp,
        quote.receivedAt,
      );

      assert.equal(
        fetchCalls,
        0,
        "demo execution must not use fetch",
      );

      console.log(
        "[PASS] demo -> PAPER ExecutionQuote",
      );

      console.log(
        "[PASS] demo compatibility timestamp == receivedAt",
      );

      console.log(
        "[PASS] demo network calls = 0",
      );

      return;
    }

    let thrown: unknown;

    try {
      await getTradingQuote("XAUUSD");
    } catch (error) {
      thrown = error;
    }

    assert.ok(
      thrown,
      "Twelve execution must fail closed",
    );

    assert.equal(
      typeof thrown,
      "object",
    );

    const error = thrown as {
      code?: unknown;
      statusCode?: unknown;
      status?: unknown;
      message?: unknown;
    };

    assert.equal(
      error.code,
      "TRADING_QUOTE_UNVERIFIED",
    );

    assert.equal(
      fetchCalls,
      0,
      "Twelve execution guard must run before fetch",
    );

    console.log(
      "[PASS] Twelve execution -> TRADING_QUOTE_UNVERIFIED",
    );

    console.log(
      "[PASS] Twelve network calls = 0",
    );
  } finally {
    globalThis.fetch =
      originalFetch;
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
    /*
     * Use the same tsx executable that launched this parent.
     * Each child gets a fresh ESM module cache, which is required
     * because market/service.ts constructs its provider once.
     */
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

          /*
           * Deliberately fake.
           * If the Twelve execution path incorrectly reaches the
           * provider/network, our fetch trap still prevents any
           * external request.
           */
          TWELVE_DATA_API_KEY:
            "offline-execution-boundary-test",
        },
      },
    );

    if (result.stdout) {
      process.stdout.write(
        result.stdout,
      );
    }

    if (result.stderr) {
      process.stderr.write(
        result.stderr,
      );
    }

    assert.equal(
      result.status,
      0,
      `${selected} child failed`,
    );
  }

  console.log("");
  console.log(
    "[PASS] Execution Boundary Regression: 2/2 scenarios",
  );
}

if (scenario === "demo" || scenario === "twelve") {
  await runScenario(scenario);
} else {
  runParent();
}
