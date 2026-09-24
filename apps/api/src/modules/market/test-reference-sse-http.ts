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
 * 2. Cached quote is emitted immediately.
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
    1,
  );

  assert.ok(
    res.writes[0].startsWith(
      "event: quote\ndata: ",
    ),
  );

  req.emit("close");

  pass("cached reference quote is emitted immediately");
}

/*
 * 3. Delivery shape does not expose internal capability.
 */
{
  const req = createRequest();

  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  const line =
    res.writes[0]
      .split("\n")
      .find((value) =>
        value.startsWith("data: "),
      );

  assert.ok(line);

  const payload =
    JSON.parse(
      line.slice("data: ".length),
    ) as Record<string, unknown>;

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

  pass("SSE payload does not leak executionCapability");
}

/*
 * 4. Controller must not repeatedly emit the same cache version.
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
    1,
  );

  await sleep(600);

  const quoteEvents =
    res.writes.filter((value) =>
      value.startsWith("event: quote"),
    );

  assert.equal(
    quoteEvents.length,
    1,
  );

  req.emit("close");

  pass("unchanged cached quote is not emitted twice");
}

/*
 * 5. Disconnect stops observation timer.
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

  pass("disconnect stops SSE cache observation");
}

/*
 * 6. Cleanup is idempotent.
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

  await sleep(300);

  pass("SSE cleanup is idempotent");
}

/*
 * 7. Empty symbol fails before opening stream.
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

  pass("empty symbol is rejected before SSE starts");
}

console.log("");
console.log(
  `[PASS] Reference SSE HTTP: ${passed}/7 tests`,
);
