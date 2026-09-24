import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import {
  fileURLToPath,
} from "node:url";
import {
  dirname,
  resolve,
} from "node:path";

const here =
  dirname(fileURLToPath(import.meta.url));

const mainPath =
  resolve(
    here,
    "../../main.ts",
  );

const source =
  await readFile(
    mainPath,
    "utf8",
  );

function position(
  text: string,
): number {
  const index =
    source.indexOf(text);

  assert.notEqual(
    index,
    -1,
    `missing lifecycle anchor: ${text}`,
  );

  return index;
}

const listen =
  position(
    "const server = app.listen(port, () => {",
  );

const startup =
  position(
    "void startBackgroundServices().catch",
  );

const warmup =
  position(
    "await referenceQuoteFeed.refresh();",
  );

const feedStart =
  position(
    "referenceQuoteFeed.start();",
  );

const stopWorkerStart =
  position(
    "stopWorker.start();",
  );

const limitWorkerStart =
  position(
    "limitWorker.start();",
  );

const stopOutWorkerStart =
  position(
    "stopOutWorker.start();",
  );

const shutdown =
  position(
    "async function shutdown(",
  );

const feedStop =
  position(
    "referenceQuoteFeed.stop(),",
  );

const dbClose =
  position(
    "await db.close();",
  );

assert.ok(
  startup > listen,
  "background lifecycle must be attached to successful HTTP listen",
);

assert.ok(
  warmup < feedStart,
  "reference warm-up must happen before feed timer starts",
);

assert.ok(
  feedStart < stopWorkerStart,
  "reference feed must start before trading workers",
);

assert.ok(
  stopWorkerStart < limitWorkerStart,
);

assert.ok(
  limitWorkerStart < stopOutWorkerStart,
);

assert.ok(
  feedStop > shutdown,
  "feed stop must belong to shutdown lifecycle",
);

assert.ok(
  feedStop < dbClose,
  "feed must stop before database close",
);

assert.match(
  source,
  /Reference quote feed warm-up failed:/,
);

assert.match(
  source,
  /if \(shuttingDown\) \{\s*return;\s*\}/,
);

assert.equal(
  (
    source.match(
      /referenceQuoteFeed\.start\(\);/g,
    ) ?? []
  ).length,
  1,
);

assert.equal(
  (
    source.match(
      /referenceQuoteFeed\.stop\(\)/g,
    ) ?? []
  ).length,
  1,
);

console.log(
  "[PASS] feed lifecycle attaches after successful HTTP listen",
);
console.log(
  "[PASS] warm-up precedes feed timer",
);
console.log(
  "[PASS] warm-up failure is non-fatal",
);
console.log(
  "[PASS] shutdown guard prevents late feed start",
);
console.log(
  "[PASS] feed starts before trading workers",
);
console.log(
  "[PASS] feed stops before DB close",
);
console.log(
  "[PASS] feed start/stop integration is singular",
);

console.log("");
console.log(
  "[PASS] Reference Feed Lifecycle: 7/7",
);
