import {
  assertExecutableQuote,
  deriveExecutable,
  validateReferenceQuote,
} from "./quote-contract.js";

import { toReferenceQuote } from "./quote-adapter.js";

import type { MarketPriceResponse } from "./types.js";

let passed = 0;
let failed = 0;

function test(
  name: string,
  fn: () => void,
): void {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    console.error(error);
  }
}

function expect(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(
  fn: () => void,
): void {
  let thrown = false;

  try {
    fn();
  } catch {
    thrown = true;
  }

  if (!thrown) {
    throw new Error("Expected function to throw");
  }
}

function makeLegacy(
  overrides: Partial<MarketPriceResponse> = {},
): MarketPriceResponse {
  return {
    symbol: "XAUUSD",
    bid: "3651.20",
    ask: "3651.40",
    last: "3651.30",
    source: "demo",
    timestamp: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

test(
  "demo maps to SYNTHETIC/PAPER",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        source: "demo",
      }),
    );

    expect(
      quote.bidAskType === "SYNTHETIC",
      "Expected SYNTHETIC",
    );

    expect(
      quote.executionCapability === "PAPER",
      "Expected PAPER",
    );

    expect(
      deriveExecutable(quote),
      "Demo must be paper executable",
    );

    validateReferenceQuote(quote);
    assertExecutableQuote(quote);
  },
);

test(
  "twelve-data maps to SYNTHETIC/NONE",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        source: "twelve-data",
      }),
    );

    expect(
      quote.bidAskType === "SYNTHETIC",
      "Expected SYNTHETIC",
    );

    expect(
      quote.executionCapability === "NONE",
      "Expected NONE",
    );

    expect(
      !deriveExecutable(quote),
      "Twelve must not be executable",
    );

    validateReferenceQuote(quote);

    expectThrows(() => {
      assertExecutableQuote(quote);
    });
  },
);

test(
  "unknown provider fails closed",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        source: "future-unknown-provider",
      }),
    );

    expect(
      quote.executionCapability === "NONE",
      "Unknown source must fail closed",
    );

    expect(
      !deriveExecutable(quote),
      "Unknown source must not execute",
    );
  },
);

test(
  "legacy timestamp becomes receivedAt",
  () => {
    const timestamp =
      "2026-09-23T12:34:56.789Z";

    const quote = toReferenceQuote(
      makeLegacy({
        timestamp,
      }),
    );

    expect(
      quote.receivedAt === timestamp,
      "Legacy timestamp must become receivedAt",
    );
  },
);

test(
  "execution compatibility timestamp equals receivedAt",
  () => {
    const timestamp =
      "2026-09-23T12:34:56.789Z";

    const quote = toReferenceQuote(
      makeLegacy({
        source: "demo",
        timestamp,
      }),
    );

    assertExecutableQuote(quote);

    expect(
      quote.timestamp === quote.receivedAt,
      "Compatibility timestamp must equal receivedAt",
    );

    expect(
      quote.timestamp === timestamp,
      "Compatibility timestamp changed",
    );
  },
);
test(
  "legacy timestamp never becomes sourceTimestamp",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        timestamp:
          "2026-09-23T12:34:56.789Z",
      }),
    );

    expect(
      quote.sourceTimestamp === null,
      "sourceTimestamp must remain null",
    );
  },
);

test(
  "price fields are preserved exactly",
  () => {
    const legacy = makeLegacy({
      bid: "4000.11",
      ask: "4000.29",
      last: "4000.20",
    });

    const quote = toReferenceQuote(legacy);

    expect(
      quote.symbol === legacy.symbol,
      "symbol changed",
    );

    expect(
      quote.bid === legacy.bid,
      "bid changed",
    );

    expect(
      quote.ask === legacy.ask,
      "ask changed",
    );

    expect(
      quote.last === legacy.last,
      "last changed",
    );

    expect(
      quote.source === legacy.source,
      "source changed",
    );
  },
);

test(
  "adapter does not mutate legacy object",
  () => {
    const legacy = makeLegacy();
    const snapshot = JSON.stringify(legacy);

    toReferenceQuote(legacy);

    expect(
      JSON.stringify(legacy) === snapshot,
      "Legacy object was mutated",
    );
  },
);

test(
  "invalid legacy prices remain invalid after adaptation",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        bid: "5000",
        ask: "4000",
      }),
    );

    expectThrows(() => {
      validateReferenceQuote(quote);
    });
  },
);

test(
  "invalid legacy timestamp remains invalid receivedAt",
  () => {
    const quote = toReferenceQuote(
      makeLegacy({
        timestamp: "invalid-date",
      }),
    );

    expectThrows(() => {
      validateReferenceQuote(quote);
    });
  },
);

console.log("");
console.log(
  `Quote Adapter Tests: ${passed}/${passed + failed} passed`,
);

if (failed > 0) {
  process.exitCode = 1;
}
