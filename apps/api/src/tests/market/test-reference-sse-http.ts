import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  streamReferenceQuote,
} from "./controller.js";

import {
  getReferenceQuote,
} from "./service.js";

type HeaderMap = Record<string, string>;

interface MockResponse {
  statusCode: number;
  headers: HeaderMap;
  writes: string[];
  jsonBody: unknown;

  status(code: number): MockResponse;
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(chunk: string): boolean;
  json(body: unknown): MockResponse;
}

function createResponse(): MockResponse {
  return {
    statusCode: 0,
    headers: {},
    writes: [],
    jsonBody: undefined,

    status(code: number) {
      this.statusCode = code;
      return this;
    },

    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },

    flushHeaders() {
      // Deliberately empty for controller contract testing.
    },

    write(chunk: string) {
      this.writes.push(chunk);
      return true;
    },

    json(body: unknown) {
      this.jsonBody = body;
      return this;
    },
  };
}

function createRequest(
  symbol: unknown = "XAUUSD",
): EventEmitter & {
  query: Record<string, unknown>;
} {
  const request =
    new EventEmitter() as EventEmitter & {
      query: Record<string, unknown>;
    };

  request.query = { symbol };

  return request;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function eventName(
  chunk: string,
): string | null {
  const line =
    chunk
      .split("\n")
      .find((value) =>
        value.startsWith("event: "),
      );

  return line
    ? line.slice("event: ".length)
    : null;
}

function eventData(
  chunk: string,
): Record<string, unknown> {
  const line =
    chunk
      .split("\n")
      .find((value) =>
        value.startsWith("data: "),
      );

  assert.ok(line);

  return JSON.parse(
    line.slice("data: ".length),
  ) as Record<string, unknown>;
}

function events(
  res: MockResponse,
  name: string,
): string[] {
  return res.writes.filter(
    (chunk) =>
      eventName(chunk) === name,
  );
}

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

/*
 * Warm the shared reference cache through the canonical
 * reference path.
 *
 * Under demo provider this performs no external network request.
 */
const warmedQuote =
  await getReferenceQuote("XAUUSD");

/*
 * 1. SSE headers.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  assert.equal(res.statusCode, 200);

  assert.equal(
    res.headers["content-type"],
    "text/event-stream; charset=utf-8",
  );

  assert.equal(
    res.headers["cache-control"],
    "no-cache, no-transform",
  );

  assert.equal(
    res.headers.connection,
    "keep-alive",
  );

  req.emit("close");

  pass("SSE response headers are correct");
}

/*
 * 2. Warm cache immediately produces two independent events:
 *
 * quote      -> market payload
 * freshness  -> market-data health
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  assert.equal(
    res.writes.length,
    2,
  );

  assert.equal(
    eventName(res.writes[0]),
    "quote",
  );

  assert.equal(
    eventName(res.writes[1]),
    "freshness",
  );

  const freshness =
    eventData(res.writes[1]);

  assert.equal(
    freshness.symbol,
    "XAUUSD",
  );

  assert.equal(
    freshness.status,
    "FRESH",
  );

  assert.equal(
    typeof freshness.ageMs,
    "number",
  );

  req.emit("close");

  pass(
    "cached quote and FRESH state are emitted independently",
  );
}

/*
 * 3. Quote delivery shape must still hide internal execution
 * capability after freshness was added.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  const quoteEvents =
    events(res, "quote");

  assert.equal(
    quoteEvents.length,
    1,
  );

  const payload =
    eventData(quoteEvents[0]);

  assert.equal(
    "executionCapability" in payload,
    false,
  );

  const metadata =
    payload.metadata as Record<string, unknown>;

  assert.equal(
    "executionCapability" in metadata,
    false,
  );

  req.emit("close");

  pass(
    "quote SSE payload does not leak executionCapability",
  );
}

/*
 * 4. Neither an unchanged quote nor an unchanged freshness
 * status may be emitted repeatedly.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  assert.equal(
    events(res, "quote").length,
    1,
  );

  assert.equal(
    events(res, "freshness").length,
    1,
  );

  await sleep(600);

  assert.equal(
    events(res, "quote").length,
    1,
  );

  assert.equal(
    events(res, "freshness").length,
    1,
  );

  req.emit("close");

  pass(
    "unchanged quote and freshness state are deduplicated",
  );
}

/*
 * 5. FRESH -> STALE must occur because time advances,
 * even when the cached quote itself never changes.
 *
 * Do not wait five real seconds. Controller reads Date.now()
 * on each observation, so advance the test clock beyond the
 * 5000ms freshness threshold while leaving the cache untouched.
 */
{
  const originalDateNow =
    Date.now;

  const receivedAtMs =
    Date.parse(warmedQuote.receivedAt);

  let nowMs =
    receivedAtMs + 1_000;

  Date.now = () => nowMs;

  const req = createRequest();
  const res = createResponse();

  try {
    streamReferenceQuote(
      req as never,
      res as never,
    );

    assert.equal(
      events(res, "quote").length,
      1,
    );

    assert.equal(
      events(res, "freshness").length,
      1,
    );

    assert.equal(
      eventData(
        events(res, "freshness")[0],
      ).status,
      "FRESH",
    );

    /*
     * Threshold itself is FRESH, so move strictly beyond it.
     */
    nowMs =
      receivedAtMs + 5_001;

    /*
     * One 250ms observation tick is enough.
     * 350ms gives normal scheduler tolerance without
     * turning this into a five-second wall-clock test.
     */
    await sleep(350);

    const quoteEvents =
      events(res, "quote");

    const freshnessEvents =
      events(res, "freshness");

    assert.equal(
      quoteEvents.length,
      1,
    );

    assert.equal(
      freshnessEvents.length,
      2,
    );

    assert.equal(
      eventData(
        freshnessEvents[0],
      ).status,
      "FRESH",
    );

    assert.equal(
      eventData(
        freshnessEvents[1],
      ).status,
      "STALE",
    );

    assert.equal(
      eventData(
        freshnessEvents[1],
      ).ageMs,
      5_001,
    );

    pass(
      "unchanged quote transitions FRESH -> STALE without a new quote event",
    );
  }
  finally {
    req.emit("close");

    Date.now =
      originalDateNow;
  }
}

/*
 * 6. Disconnect stops both quote and freshness observation.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  req.emit("close");

  const writesAfterClose =
    res.writes.length;

  await sleep(600);

  assert.equal(
    res.writes.length,
    writesAfterClose,
  );

  pass(
    "disconnect stops SSE quote and freshness observation",
  );
}

/*
 * 7. Cleanup remains idempotent.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  req.emit("close");
  req.emit("aborted");
  req.emit("close");

  const writesAfterClose =
    res.writes.length;

  await sleep(300);

  assert.equal(
    res.writes.length,
    writesAfterClose,
  );

  pass("SSE cleanup is idempotent");
}

/*
 * 8. Empty symbol still fails before opening the stream.
 */
{
  const req = createRequest("   ");
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  assert.equal(
    res.statusCode,
    400,
  );

  assert.deepEqual(
    res.jsonBody,
    {
      success: false,
      message: "Symbol không hợp lệ.",
      code: "INVALID_MARKET_SYMBOL",
    },
  );

  assert.equal(
    res.writes.length,
    0,
  );

  pass(
    "empty symbol is rejected before SSE starts",
  );
}

console.log("");
console.log(
  `[PASS] Reference SSE HTTP: ${passed}/8 tests`,
);
