import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = await mkdtemp(join(tmpdir(), "twelve-data-budget-"));
const originalBudget = process.env.TWELVE_DATA_BUDGET_FILE;

try {
  const budgetFile = join(tempDir, "budget.json");
  const now = Date.now();

  await writeFile(
    budgetFile,
    JSON.stringify({
      minuteWindow: Math.floor(now / 60_000),
      minuteCredits: 6,
      utcDay: new Date(now).toISOString().slice(0, 10),
      dailyCredits: 598,
    }),
  );

  process.env.TWELVE_DATA_BUDGET_FILE = budgetFile;

  const { reserveTwelveDataCredits } = await import(
    "./twelve-data-budget.js"
  );

  await assert.doesNotReject(
    () => reserveTwelveDataCredits(1),
    "Should allow a request while still under the current Twelve Data plan limits",
  );

  console.log("[PASS] budget guard accepts requests under configured plan limits");
} finally {
  if (originalBudget === undefined) {
    delete process.env.TWELVE_DATA_BUDGET_FILE;
  } else {
    process.env.TWELVE_DATA_BUDGET_FILE = originalBudget;
  }

  await rm(tempDir, { recursive: true, force: true });
}
