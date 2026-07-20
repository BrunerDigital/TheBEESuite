import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { inspectDeploymentOps } from "../scripts/deployment-ops-check.mjs";

function fixture(options: { scheduleCron?: boolean; protectCron?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "bee-ops-check-"));
  mkdirSync(join(root, "src/app/api/cron/example"), { recursive: true });
  mkdirSync(join(root, "prisma/migrations/20260720000000_example"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "vercel-build": "prisma generate && npm run lint && npm run typecheck && npm test && next build" } }));
  writeFileSync(join(root, "vercel.json"), JSON.stringify({ crons: options.scheduleCron === false ? [] : [{ path: "/api/cron/example", schedule: "0 0 * * *" }] }));
  writeFileSync(join(root, "src/app/api/cron/example/route.ts"), options.protectCron === false ? "export const GET = () => null;" : "process.env.CRON_SECRET; request.headers.get('authorization');");
  writeFileSync(join(root, "prisma/migrations/20260720000000_example/migration.sql"), "SELECT 1;");
  return root;
}

test("deployment ops check accepts aligned build, cron, and migration files", () => {
  assert.equal(inspectDeploymentOps(fixture()).ok, true);
});

test("deployment ops check rejects unscheduled or unprotected cron handlers", () => {
  const unscheduled = inspectDeploymentOps(fixture({ scheduleCron: false }));
  assert.equal(unscheduled.ok, false);
  assert.match(unscheduled.failures.join("\n"), /not scheduled/);

  const unprotected = inspectDeploymentOps(fixture({ protectCron: false }));
  assert.equal(unprotected.ok, false);
  assert.match(unprotected.failures.join("\n"), /does not enforce CRON_SECRET/);
});
