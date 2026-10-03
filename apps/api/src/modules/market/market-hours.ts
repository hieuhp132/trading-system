export function isMarketClosedByWeekend(now = new Date()): boolean {
  const date = new Date(now);
  const day = date.getDay();
  const minutesFromMidnight = date.getHours() * 60 + date.getMinutes();

  if (day === 6) {
    return true;
  }

  if (day === 0) {
    return true;
  }

  if (day === 1 && minutesFromMidnight < 5 * 60) {
    return true;
  }

  return false;
}

export function shouldPauseMarketPolling(now = new Date()): boolean {
  return isMarketClosedByWeekend(now);
}

export function isMarketClosedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    statusCode?: number;
  };

  return candidate.code === "MARKET_CLOSED" || candidate.statusCode === 503;
}

export function markMarketClosedConfirmed(): void {
  return;
}

export function clearMarketClosedConfirmed(): void {
  return;
}

export function marketClosedIsConfirmed(): boolean {
  return false;
}
