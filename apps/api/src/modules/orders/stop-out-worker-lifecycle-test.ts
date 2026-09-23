import assert from "node:assert/strict";

import {
  createStopOutWorker,
  type StopOutWorkerDependencies,
} from "./stop-out-worker.js";

let passed = 0;
let total = 0;

async function test(
  name: string,
  fn: () => Promise<void> | void,
): Promise<void> {
  total += 1;

  try {
    await fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function dependencies(
  overrides:
    Partial<StopOutWorkerDependencies> = {},
): StopOutWorkerDependencies {
  return {
    async listPositions() {
      return [];
    },

    async getQuote() {
      throw new Error(
        "getQuote should not be called when there are no positions",
      );
    },

    async getUserId() {
      return null;
    },

    async execute() {
      throw new Error(
        "execute should not be called",
      );
    },

    logError(error, context) {
      throw new Error(
        `Unexpected worker error (${context}): ${String(error)}`,
      );
    },

    ...overrides,
  };
}

await test(
  "start schedules automatic ticks",
  async () => {
    let listCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;
            return [];
          },
        }),
        {
          intervalMs: 100,
        },
      );

    worker.start();

    try {
      await sleep(160);

      assert.ok(
        listCalls >= 1,
        `expected >= 1 tick, got ${listCalls}`,
      );
    } finally {
      await worker.stop();
    }
  },
);

await test(
  "repeated start does not create duplicate schedulers",
  async () => {
    let listCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;
            return [];
          },
        }),
        {
          intervalMs: 100,
        },
      );

    worker.start();
    worker.start();
    worker.start();

    try {
      await sleep(160);

      assert.equal(
        listCalls,
        1,
        `expected exactly one first scheduled tick, got ${listCalls}`,
      );
    } finally {
      await worker.stop();
    }
  },
);

await test(
  "stop before first tick cancels scheduled work",
  async () => {
    let listCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;
            return [];
          },
        }),
        {
          intervalMs: 150,
        },
      );

    worker.start();

    await sleep(20);
    await worker.stop();

    await sleep(180);

    assert.equal(listCalls, 0);
  },
);

await test(
  "stop waits for an active tick",
  async () => {
    let started = false;
    let completed = false;

    let release:
      (() => void) | undefined;

    const gate =
      new Promise<void>((resolve) => {
        release = resolve;
      });

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            started = true;

            await gate;

            completed = true;
            return [];
          },
        }),
        {
          intervalMs: 100,
        },
      );

    worker.start();

    for (
      let attempt = 0;
      attempt < 30 && !started;
      attempt += 1
    ) {
      await sleep(10);
    }

    assert.equal(
      started,
      true,
      "scheduled tick did not start",
    );

    let stopResolved = false;

    const stopping =
      worker.stop().then(() => {
        stopResolved = true;
      });

    await sleep(30);

    assert.equal(
      stopResolved,
      false,
      "stop resolved before active tick completed",
    );

    release?.();

    await stopping;

    assert.equal(completed, true);
    assert.equal(stopResolved, true);
  },
);

await test(
  "stop prevents future rescheduling",
  async () => {
    let listCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;
            return [];
          },
        }),
        {
          intervalMs: 100,
        },
      );

    worker.start();

    await sleep(140);

    await worker.stop();

    const callsAtStop =
      listCalls;

    await sleep(220);

    assert.equal(
      listCalls,
      callsAtStop,
    );
  },
);

await test(
  "start after stop does not restart worker",
  async () => {
    let listCalls = 0;

    const worker =
      createStopOutWorker(
        dependencies({
          async listPositions() {
            listCalls += 1;
            return [];
          },
        }),
        {
          intervalMs: 100,
        },
      );

    worker.start();

    await sleep(20);
    await worker.stop();

    worker.start();

    await sleep(140);

    assert.equal(listCalls, 0);
  },
);

console.log(
  `\n[PASS] Stop-Out Worker Lifecycle: ${passed}/${total} tests`,
);

if (passed !== total) {
  process.exit(1);
}