import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
test("actual audit export enforces fresh session scope complete snapshot and private failure", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/audit-history-route-mocks.mjs", import.meta.url))], { encoding: "utf8", env });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /actual read-only auditor and director exports/);
});
test("audit page uses the shared safe snapshot and never sends raw audit objects", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8"), viewer = readFileSync("src/components/audit-log-viewer.tsx", "utf8");
  const block = page.slice(page.indexOf('if (slug === "audit-logs")'), page.indexOf('if (slug === "asset-hub")'));
  assert.match(block, /parseAuditHistoryFilters\(searchParams\)/); assert.match(block, /readAuditHistoryPage\(tx, user, filters\)/); assert.match(block, /RepeatableRead/);
  assert.doesNotMatch(block, /auditLog.findMany|include:|take: 100/); assert.match(viewer, /Print this page/); assert.match(viewer, /Export all matches/);
  assert.doesNotMatch(viewer, /logs.filter|safeCsvCell|makeCsvRows/); assert.match(viewer, /activeExport.current\?\.abort/); assert.match(viewer, /setDraft\(\{ key: nextKey/);
});
