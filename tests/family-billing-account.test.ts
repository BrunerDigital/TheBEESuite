import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("director-created and updated families always have a billing account", () => {
  const route = readFileSync(new URL("../src/app/api/operations/records/route.ts", import.meta.url), "utf8");
  const familyBranch = route.slice(
    route.indexOf('} else if (entity === "family") {'),
    route.indexOf('} else if (entity === "familyMerge") {'),
  );

  assert.match(familyBranch, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(familyBranch, /tx\.billingAccount\.upsert\(\{/);
  assert.match(familyBranch, /where: \{ familyId: family\.id \}/);
  assert.match(familyBranch, /update: \{\}/);
  assert.match(familyBranch, /create: \{ familyId: family\.id, balanceCents: 0 \}/);
});
