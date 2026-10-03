import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import {
  streamReferenceQuote,
} from "./controller.js";

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
      this.headers[name] = value;
    },

    flushHeaders() {
      // no-op
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
  symbol = "XAUUSD",
): EventEmitter & {
  query: {
    symbol: string;
  };
} {
  const req =
    new EventEmitter() as EventEmitter & {
      query: {
        symbol: string;
      };
    };

  req.query = {
    symbol,
  };

  return req;
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
): unknown {
  const line =
    chunk
      .split("\n")
      .find((value) =>
        value.startsWith("data: "),
      );

  assert.ok(line);

  return JSON.parse(
    line.slice("data: ".length),
  );
}

function sleep(
  ms: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

let passed = 0;

function pass(name: string): void {
  passed += 1;
  console.log(`[PASS] ${name}`);
}

/*
 * This focused test intentionally does not populate
 * the reference cache.
 *
 * Transport can be connected while market data is
 * missing. Those are independent states.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  assert.equal(
    res.statusCode,
    200,
  );

  assert.equal(
    res.writes.length,
    1,
  );

  assert.equal(
    eventName(res.writes[0]),
    "freshness",
  );

  assert.deepEqual(
    eventData(res.writes[0]),
    {
      symbol: "XAUUSD",
      status: "MISSING",
      ageMs: null,
    },
  );

  req.emit("close");

  pass(
    "empty cache immediately emits MISSING freshness",
  );
}

/*
 * The 250ms observation loop must not spam the same
 * freshness state repeatedly.
 */
{
  const req = createRequest();
  const res = createResponse();

  streamReferenceQuote(
    req as never,
    res as never,
  );

  await sleep(600);

  const freshnessEvents =
    res.writes.filter(
      (chunk) =>
        eventName(chunk) ===
        "freshness",
    );

  assert.equal(
    freshnessEvents.length,
    1,
  );

  req.emit("close");

  pass(
    "unchanged freshness status is deduplicated",
  );
}

/*
 * Disconnect must stop the combined quote/freshness
 * observation loop.
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

  await sleep(350);

  assert.equal(
    res.writes.length,
    writesAfterClose,
  );

  pass(
    "freshness observation stops on disconnect",
  );
}

console.log("");
console.log(
  `[PASS] Reference SSE Freshness HTTP: ${passed}/3 tests`,
);
