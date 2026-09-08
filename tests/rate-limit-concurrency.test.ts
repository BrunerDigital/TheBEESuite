import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("persistent rate limits increment only while the database count is below the limit", () => {
  const source = readFileSync("src/lib/rate-limit.ts", "utf8");
  assert.match(source, /rateLimitBucket\.updateMany\([\s\S]*count: \{ lt: options\.limit \}[\s\S]*count: \{ increment: 1 \}/);
  assert.match(source, /resetAt: \{ lte: nowDate \}/);
  assert.doesNotMatch(source, /rateLimitBucket\.update\(\{[\s\S]*count: \{ increment: 1 \}/);
});
