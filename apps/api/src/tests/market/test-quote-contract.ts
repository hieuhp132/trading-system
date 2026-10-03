import {
  assertExecutableQuote,
  deriveExecutable,
  isExecutableQuote,
  validateReferenceQuote,
  type ExecutionQuote,
  type ReferenceQuote,
} from "./quote-contract.js";

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

const baseReference: ReferenceQuote = {
  symbol: "XAUUSD",
  bid: "3651.20",
  ask: "3651.40",
  last: "3651.30",
  source: "demo",
  sourceTimestamp: null,
  receivedAt: "2026-09-23T12:00:00.000Z",
  bidAskType: "SYNTHETIC",
  executionCapability: "PAPER",
};

const baseExecution: ExecutionQuote = {
  ...baseReference,
  executionCapability: "PAPER",
  timestamp: baseReference.receivedAt,
};

test(
  "valid PAPER synthetic quote is a valid reference quote",
  () => {
    validateReferenceQuote(baseReference);
  },
);

test(
  "PAPER quote is executable",
  () => {
    if (!isExecutableQuote(baseExecution)) {
      throw new Error(
        "Expected PAPER quote to be executable",
      );
    }

    if (!deriveExecutable(baseExecution)) {
      throw new Error("Expected executable=true");
    }

    assertExecutableQuote(baseExecution);
  },
);

test(
  "NONE quote is reference-only",
  () => {
    const quote: ReferenceQuote = {
      ...baseReference,
      source: "twelve-data",
      executionCapability: "NONE",
    };

    validateReferenceQuote(quote);

    if (isExecutableQuote(quote)) {
      throw new Error(
        "NONE quote must not be executable",
      );
    }

    if (deriveExecutable(quote)) {
      throw new Error("Expected executable=false");
    }

    expectThrows(() => {
      assertExecutableQuote(quote);
    });
  },
);

test(
  "LIVE capability is executable independently of bidAskType",
  () => {
    const quote: ExecutionQuote = {
      ...baseReference,
      source: "future-broker",
      bidAskType: "REAL",
      executionCapability: "LIVE",
      timestamp: baseReference.receivedAt,
    };

    assertExecutableQuote(quote);

    if (!deriveExecutable(quote)) {
      throw new Error(
        "Expected LIVE quote to be executable",
      );
    }
  },
);

test(
  "synthetic does not automatically mean non-executable",
  () => {
    const quote: ExecutionQuote = {
      ...baseReference,
      bidAskType: "SYNTHETIC",
      executionCapability: "PAPER",
      timestamp: baseReference.receivedAt,
    };

    assertExecutableQuote(quote);
  },
);

test(
  "REAL does not automatically mean executable",
  () => {
    const quote: ReferenceQuote = {
      ...baseReference,
      bidAskType: "REAL",
      executionCapability: "NONE",
    };

    validateReferenceQuote(quote);

    if (deriveExecutable(quote)) {
      throw new Error(
        "REAL market data must not imply execution capability",
      );
    }
  },
);

test(
  "sourceTimestamp may be null",
  () => {
    validateReferenceQuote({
      ...baseReference,
      sourceTimestamp: null,
    });
  },
);

test(
  "trustworthy sourceTimestamp may be supplied",
  () => {
    validateReferenceQuote({
      ...baseReference,
      sourceTimestamp:
        "2026-09-23T11:59:59.000Z",
    });
  },
);

test(
  "invalid sourceTimestamp is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        sourceTimestamp: "not-a-date",
      });
    });
  },
);

test(
  "invalid receivedAt is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        receivedAt: "not-a-date",
      });
    });
  },
);

test(
  "bid greater than ask is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        bid: "3652.00",
        ask: "3651.00",
      });
    });
  },
);

test(
  "non-positive price is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        bid: "0",
      });
    });
  },
);

test(
  "empty symbol is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        symbol: " ",
      });
    });
  },
);

test(
  "empty source is rejected",
  () => {
    expectThrows(() => {
      validateReferenceQuote({
        ...baseReference,
        source: " ",
      });
    });
  },
);

console.log("");
console.log(
  `Quote Contract Tests: ${passed}/${passed + failed} passed`,
);

if (failed > 0) {
  process.exitCode = 1;
}
