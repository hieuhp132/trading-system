import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { AppError } from "../../common/errors/app-error.js";

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

const MINUTE_LIMIT = readPositiveIntEnv(
  "TWELVE_DATA_MINUTE_LIMIT",
  1,
);
const DAILY_LIMIT = readPositiveIntEnv(
  "TWELVE_DATA_DAILY_LIMIT",
  10,
);

const configuredBudgetFile = process.env.TWELVE_DATA_BUDGET_FILE;

if (
  process.env.NODE_ENV === "production" &&
  (!configuredBudgetFile || !isAbsolute(configuredBudgetFile))
) {
  throw new Error(
    "Production requires an absolute TWELVE_DATA_BUDGET_FILE path",
  );
}

const STATE_FILE = resolve(
  configuredBudgetFile ?? "./data/twelve-data-budget.json",
);

interface BudgetState {
  minuteWindow: number;
  minuteCredits: number;
  utcDay: string;
  dailyCredits: number;
}

export class TwelveDataBudgetError extends AppError {
  constructor(message: string) {
    super(message, 503, "MARKET_DATA_QUOTA_EXCEEDED");
  }
}

let queue: Promise<void> = Promise.resolve();

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function minuteWindow(now: number): number {
  return Math.floor(now / 60_000);
}

function initialState(now: number): BudgetState {
  return {
    minuteWindow: minuteWindow(now),
    minuteCredits: 0,
    utcDay: utcDay(now),
    dailyCredits: 0,
  };
}

function validateState(value: unknown): BudgetState {
  if (!value || typeof value !== "object") {
    throw new TwelveDataBudgetError("Budget state không hợp lệ");
  }

  const state = value as Partial<BudgetState>;

  if (
    !Number.isSafeInteger(state.minuteWindow) ||
    !Number.isSafeInteger(state.minuteCredits) ||
    !Number.isSafeInteger(state.dailyCredits) ||
    typeof state.utcDay !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(state.utcDay) ||
    state.minuteWindow! < 0 ||
    state.minuteCredits! < 0 ||
    state.dailyCredits! < 0
  ) {
    throw new TwelveDataBudgetError("Budget state bị hỏng");
  }

  return state as BudgetState;
}

async function loadState(now: number): Promise<BudgetState> {
  try {
    return validateState(
      JSON.parse(await readFile(STATE_FILE, "utf8")),
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new TwelveDataBudgetError(
        "Budget state không tồn tại; từ chối request để tránh reset credits",
      );
    }

    throw new TwelveDataBudgetError(
      "Không đọc được Twelve Data budget state; từ chối request",
    );
  }
}

async function saveState(state: BudgetState): Promise<void> {
  await mkdir(dirname(STATE_FILE), { recursive: true });

  const temp = `${STATE_FILE}.${process.pid}.tmp`;

  try {
    const handle = await open(temp, "wx");

    try {
      await handle.writeFile(JSON.stringify(state, null, 2), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temp, STATE_FILE);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function reserveCreditsInternal(
  credits: number,
): Promise<void> {
  if (!Number.isSafeInteger(credits) || credits < 1) {
    throw new TwelveDataBudgetError("Credits phải là số nguyên dương");
  }

  const now = Date.now();
  const state = await loadState(now);

  const currentMinute = minuteWindow(now);
  const currentDay = utcDay(now);

  // Không cho phép đồng hồ hệ thống quay ngược làm reset ngân sách.
  if (
    currentMinute < state.minuteWindow ||
    currentDay < state.utcDay
  ) {
    throw new TwelveDataBudgetError(
      "System clock không hợp lệ; từ chối request",
    );
  }

  if (state.minuteWindow !== currentMinute) {
    state.minuteWindow = currentMinute;
    state.minuteCredits = 0;
  }

  if (state.utcDay !== currentDay) {
    state.utcDay = currentDay;
    state.dailyCredits = 0;
  }

  if (
    state.minuteCredits + credits > MINUTE_LIMIT ||
    state.dailyCredits + credits > DAILY_LIMIT
  ) {
    throw new TwelveDataBudgetError(
      "Twelve Data API budget exceeded",
    );
  }

  state.minuteCredits += credits;
  state.dailyCredits += credits;

  await saveState(state);
}

export function reserveTwelveDataCredits(
  credits: number,
): Promise<void> {
  const result = queue.then(() =>
    reserveCreditsInternal(credits),
  );

  queue = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}