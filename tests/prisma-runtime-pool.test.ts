import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("server runtime keeps a bounded pool large enough for concurrent dashboard queries", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/prisma.ts"), "utf8");

  assert.match(source, /PRISMA_CONNECTION_LIMIT \?\? "5"/);
  assert.match(source, /PRISMA_POOL_TIMEOUT \?\? "20"/);
  assert.doesNotMatch(source, /PRISMA_CONNECTION_LIMIT \?\? "1"/);
});
