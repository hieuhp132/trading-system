import test from "node:test";
import assert from "node:assert/strict";
import { createStopWorker } from "../dist/modules/orders/stop-worker.js";

function dependencies(overrides = {}) {
  return {
    listPositions: async () => [],
    getQuote: async () => {
      throw new Error("Unexpected quote request");
    },
    getUserId: async () => {
      throw new Error("Unexpected account lookup");
    },
    execute: async () => {
      throw new Error("Unexpected trade execution");
    },
    logError: (error) => {
      throw error;
    },
    ...overrides,
  };
}

test("Empty tick does not request quotes or execute trades", async () => {
  let scans = 0;

  const worker = createStopWorker(
    dependencies({
      listPositions: async () => {
        scans++;
        return [];
      },
    }),
  );

  await worker.tick();

  assert.equal(scans, 1);
  await worker.stop();
});

test("stop waits for active tick and prevents further ticks", async () => {
  let scans = 0;
  let releaseTick;

  const tickStarted = new Promise((resolve) => {
    releaseTick = { started: resolve };
  });

  let finishTick;
  const tickBlocked = new Promise((resolve) => {
    finishTick = resolve;
  });

  const worker = createStopWorker(
    dependencies({
      listPositions: async () => {
        scans++;
        releaseTick.started();
        await tickBlocked;
        return [];
      },
    }),
    { intervalMs: 100 },
  );

  worker.start();

  try {
    await Promise.race([
      tickStarted,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Worker did not tick")), 2000),
      ),
    ]);

    assert.equal(scans, 1);

    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    assert.equal(stopped, false);

    finishTick();
    await stopping;

    assert.equal(stopped, true);

    await new Promise((resolve) => setTimeout(resolve, 250));

    assert.equal(scans, 1);
  } finally {
    finishTick();
    await worker.stop();
  }
});

function makeQuote(bid, ask) {
  return {
    symbol: "XAUUSD",
    bid: String(bid),
    ask: String(ask),
    last: String((Number(bid) + Number(ask)) / 2),
    source: "demo",
    timestamp: new Date().toISOString(),
  };
}

const triggerCases = [
  {
    name: "LONG Stop Loss uses BID",
    side: "LONG",
    stopLoss: "100.00",
    takeProfit: "110.00",
    bid: "99.00",
    ask: "99.20",
  },
  {
    name: "LONG Take Profit uses BID",
    side: "LONG",
    stopLoss: "100.00",
    takeProfit: "110.00",
    bid: "111.00",
    ask: "111.20",
  },
  {
    name: "SHORT Stop Loss uses ASK",
    side: "SHORT",
    stopLoss: "110.00",
    takeProfit: "90.00",
    bid: "111.80",
    ask: "112.00",
  },
  {
    name: "SHORT Take Profit uses ASK",
    side: "SHORT",
    stopLoss: "110.00",
    takeProfit: "90.00",
    bid: "88.80",
    ask: "89.00",
  },
];

for (const scenario of triggerCases) {
  test(scenario.name, async () => {
    const executions = [];
    const errors = [];

    const quote = makeQuote(scenario.bid, scenario.ask);

    const worker = createStopWorker(
      dependencies({
        listPositions: async () => [{
          id: "position-test",
          accountId: "account-test",
          side: scenario.side,
          stopLoss: scenario.stopLoss,
          takeProfit: scenario.takeProfit,
        }],

        getQuote: async () => quote,

        getUserId: async (accountId) => {
          assert.equal(accountId, "account-test");
          return "user-test";
        },

        execute: async (userId, positionId, receivedQuote) => {
          executions.push({ userId, positionId, receivedQuote });
        },

        logError: (error) => {
          errors.push(error);
        },
      }),
    );

    await worker.tick();
    await worker.stop();

    assert.deepEqual(errors, []);
    assert.equal(executions.length, 1);
    assert.equal(executions[0].userId, "user-test");
    assert.equal(executions[0].positionId, "position-test");
    assert.equal(executions[0].receivedQuote, quote);
  });
}

test("No SL/TP trigger does not execute a trade", async () => {
  let executions = 0;
  let accountLookups = 0;
  const errors = [];

  const worker = createStopWorker(
    dependencies({
      listPositions: async () => [{
        id: "position-test",
        accountId: "account-test",
        side: "LONG",
        stopLoss: "100.00",
        takeProfit: "110.00",
      }],

      getQuote: async () => makeQuote("105.00", "105.20"),

      getUserId: async () => {
        accountLookups++;
        return "user-test";
      },

      execute: async () => {
        executions++;
      },

      logError: (error) => {
        errors.push(error);
      },
    }),
  );

  await worker.tick();
  await worker.stop();

  assert.deepEqual(errors, []);
  assert.equal(accountLookups, 0);
  assert.equal(executions, 0);
});
