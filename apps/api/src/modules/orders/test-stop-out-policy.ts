import assert from "node:assert/strict";

import {
  rankStopOutCandidates,
  type StopOutCandidate,
} from "./stop-out-policy.js";

let passed = 0;
let total = 0;

function test(
  name: string,
  fn: () => void,
): void {
  total += 1;

  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

function position(
  overrides: Partial<StopOutCandidate> & {
    id: string;
  },
): StopOutCandidate {
  return {
    id: overrides.id,
    side: overrides.side ?? "LONG",
    quantity: overrides.quantity ?? 1,
    entryPrice: overrides.entryPrice ?? 100,
    openedAt:
      overrides.openedAt ??
      "2026-01-01T00:00:00.000Z",
  };
}

test(
  "largest unrealized loss is ranked first",
  () => {
    const result = rankStopOutCandidates(
      [
        position({
          id: "small-loss",
          entryPrice: 101,
        }),
        position({
          id: "large-loss",
          entryPrice: 110,
        }),
        position({
          id: "profit",
          entryPrice: 90,
        }),
      ],
      100,
      101,
    );

    assert.deepEqual(
      result.map((item) => item.id),
      [
        "large-loss",
        "small-loss",
        "profit",
      ],
    );
  },
);

test(
  "LONG uses BID",
  () => {
    const [result] = rankStopOutCandidates(
      [
        position({
          id: "long",
          side: "LONG",
          entryPrice: 100,
        }),
      ],
      99,
      101,
    );

    assert.equal(
      result.unrealizedPnl,
      -100,
    );
  },
);

test(
  "SHORT uses ASK",
  () => {
    const [result] = rankStopOutCandidates(
      [
        position({
          id: "short",
          side: "SHORT",
          entryPrice: 100,
        }),
      ],
      99,
      101,
    );

    assert.equal(
      result.unrealizedPnl,
      -100,
    );
  },
);

test(
  "larger lot loss is ranked first",
  () => {
    const result = rankStopOutCandidates(
      [
        position({
          id: "one-lot",
          quantity: 1,
          entryPrice: 101,
        }),
        position({
          id: "two-lot",
          quantity: 2,
          entryPrice: 101,
        }),
      ],
      100,
      101,
    );

    assert.deepEqual(
      result.map((item) => item.id),
      ["two-lot", "one-lot"],
    );
  },
);

test(
  "equal P&L uses older position first",
  () => {
    const result = rankStopOutCandidates(
      [
        position({
          id: "newer",
          openedAt:
            "2026-01-02T00:00:00.000Z",
        }),
        position({
          id: "older",
          openedAt:
            "2026-01-01T00:00:00.000Z",
        }),
      ],
      99,
      100,
    );

    assert.deepEqual(
      result.map((item) => item.id),
      ["older", "newer"],
    );
  },
);

test(
  "equal P&L and openedAt uses id",
  () => {
    const result = rankStopOutCandidates(
      [
        position({ id: "position-b" }),
        position({ id: "position-a" }),
      ],
      99,
      100,
    );

    assert.deepEqual(
      result.map((item) => item.id),
      ["position-a", "position-b"],
    );
  },
);

test(
  "input array is not mutated",
  () => {
    const input = [
      position({
        id: "b",
        entryPrice: 101,
      }),
      position({
        id: "a",
        entryPrice: 110,
      }),
    ];

    const originalIds =
      input.map((item) => item.id);

    rankStopOutCandidates(
      input,
      100,
      101,
    );

    assert.deepEqual(
      input.map((item) => item.id),
      originalIds,
    );
  },
);

test(
  "invalid spread is rejected",
  () => {
    assert.throws(
      () =>
        rankStopOutCandidates(
          [position({ id: "p1" })],
          102,
          101,
        ),
      /Invalid Stop-Out BID\/ASK/,
    );
  },
);

test(
  "invalid quantity is rejected",
  () => {
    assert.throws(
      () =>
        rankStopOutCandidates(
          [
            position({
              id: "p1",
              quantity: 0,
            }),
          ],
          100,
          101,
        ),
      /Invalid position quantity/,
    );
  },
);

test(
  "invalid openedAt is rejected",
  () => {
    assert.throws(
      () =>
        rankStopOutCandidates(
          [
            position({
              id: "p1",
              openedAt: "not-a-date",
            }),
          ],
          100,
          101,
        ),
      /Invalid position openedAt/,
    );
  },
);

console.log(
  `\n[PASS] Stop-Out Liquidation Policy: ${passed}/${total} tests`,
);

if (passed !== total) {
  process.exit(1);
}