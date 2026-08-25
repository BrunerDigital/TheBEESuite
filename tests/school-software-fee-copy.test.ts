import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("operational software fee copy uses the approved corporate and partner rates", () => {
  const page = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  const route = readFileSync("src/app/api/billing/corporate/kidcity-software-invoice/route.ts", "utf8");
  const demo = readFileSync("src/lib/demo-data.ts", "utf8");
  for (const source of [page, route, demo]) {
    assert.match(source, /\$49/);
    assert.match(source, /\$79/);
  }
  assert.doesNotMatch(page, /\$99/);
  assert.doesNotMatch(route, /\$99/);
  assert.doesNotMatch(demo, /\$99 per active school/);
});
