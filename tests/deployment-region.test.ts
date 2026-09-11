import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));

test("server functions stay colocated with the existing us-west-1 database", () => {
  assert.deepEqual(config.regions, ["sfo1"]);
  assert.equal(config.functionFailoverRegions, undefined);
  for (const fn of Object.values(config.functions ?? {}) as Array<Record<string, unknown>>) {
    assert.equal(fn.regions, undefined, "review any per-function region override against database locality");
    assert.equal(fn.functionFailoverRegions, undefined);
  }
});

test("Next routes do not override deployment locality with deprecated preferredRegion exports", () => {
  const app = join(root, "src", "app");
  for (const file of readdirSync(app, { recursive: true }) as string[]) {
    if (!/(?:^|[/\\])(?:page|layout|route)\.[cm]?[jt]sx?$/.test(file)) continue;
    assert.doesNotMatch(readFileSync(join(app, file), "utf8"), /export\s+(?:const|let|var)\s+preferredRegion\b/, file);
  }
});
