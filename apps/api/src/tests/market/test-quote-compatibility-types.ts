import type {
  ExecutionQuote,
  ReferenceQuote,
} from "./quote-contract.js";

type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;

type ReferenceHasTimestamp =
  "timestamp" extends keyof ReferenceQuote
    ? true
    : false;

type ExecutionHasTimestamp =
  "timestamp" extends keyof ExecutionQuote
    ? true
    : false;

type ExecutionHasReceivedAt =
  "receivedAt" extends keyof ExecutionQuote
    ? true
    : false;

type ReferenceTimestampMustNotExist =
  ExpectFalse<ReferenceHasTimestamp>;

type ExecutionTimestampMustExist =
  Expect<ExecutionHasTimestamp>;

type ExecutionReceivedAtMustExist =
  Expect<ExecutionHasReceivedAt>;

// Keep aliases referenced under strict/noUnused configurations.
export type QuoteCompatibilityTypeAssertions = [
  ReferenceTimestampMustNotExist,
  ExecutionTimestampMustExist,
  ExecutionReceivedAtMustExist,
];
