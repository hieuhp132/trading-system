import assert from "node:assert/strict";
import { parseUtcDatetime } from "./parse-utc-datetime.js";

const validCases: Array<[string, number]> = [
  ["2026-09-22 12:30:45", Date.UTC(2026, 8, 22, 12, 30, 45) / 1000],
  ["2026-09-22T12:30:45", Date.UTC(2026, 8, 22, 12, 30, 45) / 1000],
  ["2024-02-29 00:00:00", Date.UTC(2024, 1, 29) / 1000],
  ["2026-01-01 00:00:00", Date.UTC(2026, 0, 1) / 1000],
];

const invalidCases = [
  "2026-02-30 12:00:00",
  "2025-02-29 00:00:00",
  "2026-13-01 00:00:00",
  "2026-00-01 00:00:00",
  "2026-09-22 24:00:00",
  "2026-09-22 12:60:00",
  "2026-09-22T12:30:45+07:00",
  "invalid",
];

let passed = 0;

for (const [input, expected] of validCases) {
  assert.equal(parseUtcDatetime(input), expected, input);
  passed++;
  console.log(`[PASS] Valid UTC: ${input}`);
}

for (const input of invalidCases) {
  assert.equal(parseUtcDatetime(input), null, input);
  passed++;
  console.log(`[PASS] Invalid datetime rejected: ${input}`);
}

console.log(`[PASS] UTC parser: ${passed}/12 tests.`);