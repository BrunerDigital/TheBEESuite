import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("data-integrity audit remains count-only and read-only", () => {
  const source = readFileSync(
    new URL("../scripts/audit-data-integrity-readonly.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /mode:\s*"read_only_counts"/);
  assert.match(source, /prisma\.\$queryRaw/g);
  assert.doesNotMatch(source, /\$(?:executeRaw|executeRawUnsafe|queryRawUnsafe)/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  assert.doesNotMatch(source, /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
});
