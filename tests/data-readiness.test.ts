import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildImportBatchReadinessTask,
  buildImportRowReadinessTask,
  canBulkConfirmReadinessTask,
  dataReadinessCsv,
  statusForImportRow,
  summarizeDataReadiness,
} from "@/lib/data-readiness";
import {
  dataReadinessContextForPath,
  dataReadinessViewFilters,
  filterDataReadinessTasksForContext,
} from "@/lib/data-readiness-context";

const createdAt = "2026-08-08T12:00:00.000Z";

function row(overrides: Partial<Parameters<typeof buildImportRowReadinessTask>[0]> = {}) {
  return buildImportRowReadinessTask({
    id: "row-1",
    batchId: "batch-1",
    centerId: "center-1",
    centerName: "Test school",
    filename: "procare.csv",
    rowNumber: 12,
    status: "needs_resolution",
    message: "Review retained historical note",
    rawData: { "Account ID": "A-123", Note: "Legacy memo" },
    createdAt,
    ...overrides,
  });
}

test("readiness statuses preserve imported, excluded, failed, and safety-blocked states", () => {
  assert.equal(statusForImportRow("imported", ""), "IMPORTED");
  assert.equal(statusForImportRow("disposed", ""), "EXCLUDED");
  assert.equal(statusForImportRow("failed", ""), "FAILED");
  assert.equal(statusForImportRow("needs_resolution", "custody conflict"), "BLOCKED");
  assert.equal(statusForImportRow("needs_resolution", "historical note"), "CONFIRM");
});

test("bulk confirmation is limited to low-risk rows with stable source IDs", () => {
  const safe = row();
  assert.equal(safe.category, "Historical and informational data");
  assert.equal(safe.bulkEligible, true);
  assert.equal(canBulkConfirmReadinessTask(safe), true);

  const safety = row({
    id: "row-safety",
    message: "Confirm authorized pickup and custody restriction",
    rawData: { "Child ID": "C-123", "Authorized Pickup": "No" },
  });
  assert.equal(safety.category, "Safety and custody");
  assert.equal(safety.status, "BLOCKED");
  assert.equal(canBulkConfirmReadinessTask(safety), false);

  const withoutStableId = row({ id: "row-no-id", rawData: { Note: "Legacy memo" } });
  assert.equal(canBulkConfirmReadinessTask(withoutStableId), false);
});

test("audited decisions update readiness presentation without changing source evidence", () => {
  const task = row({ decision: "exclude", decisionNote: "Duplicate historical note", decisionProposedValue: "Retain as excluded evidence", decisionAt: createdAt });
  assert.equal(task.status, "EXCLUDED");
  assert.equal(task.decisionNote, "Duplicate historical note");
  assert.equal(task.proposedValue, "Retain as excluded evidence");
  assert.equal(task.sourceIds[0], "Account ID: A-123");
});

test("batch reconciliation and exports expose source provenance", () => {
  const batch = buildImportBatchReadinessTask({
    id: "batch-1",
    centerId: "center-1",
    centerName: "Test school",
    filename: "procare.zip",
    status: "completed",
    createdAt,
    sourceSha256: "sha-256-evidence",
    reviewFingerprint: "review-fingerprint",
    rowCount: 10,
    importedRows: 9,
    unresolvedRows: 1,
    verified: false,
  });
  assert.equal(batch.status, "CONFIRM");
  assert.match(batch.sourceIds.join(" "), /sha-256-evidence/);
  const summary = summarizeDataReadiness([batch], 10);
  assert.equal(summary.actionable, 1);
  assert.equal(summary.sourceRows, 10);
  assert.match(dataReadinessCsv([batch]), /Source SHA-256: sha-256-evidence/);
});

test("readiness API is tenant-scoped, evidence-only, and keeps sensitive gates separate", () => {
  const route = readFileSync(new URL("../src/app/api/data-readiness/route.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/lib/data-readiness-server.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/data-readiness/page.tsx", import.meta.url), "utf8");
  assert.match(route, /canManageOperations/);
  assert.match(route, /evidenceOnly: true/);
  assert.match(route, /operationalRecordChanged: false/);
  assert.match(route, /Bulk confirmation is limited to low-risk rows with stable source IDs/);
  assert.match(server, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(server, /centerId: \{ in: centerIds \}/);
  assert.match(page, /requiresPasswordResetGate/);
  assert.doesNotMatch(route, /family\.(update|create|delete)/);
  assert.doesNotMatch(route, /child\.(update|create|delete)/);
  assert.doesNotMatch(route, /invoice\.(update|create|delete)/);
});

test("Honeyglass shell includes progressive navigation and reversible flags", () => {
  const shell = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const flags = readFileSync(new URL("../src/lib/honeyglass.ts", import.meta.url), "utf8");
  assert.match(shell, /function SidebarRail/);
  assert.match(shell, /function RoleBottomNav/);
  assert.match(shell, /const directorItems/);
  assert.match(shell, /DataReadinessContextBadge/);
  assert.match(css, /honeycomb-kpi-cluster/);
  assert.match(css, /readiness-honeycomb/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(flags, /NEXT_PUBLIC_HONEYGLASS_UI_ENABLED=false/);
  assert.match(flags, /NEXT_PUBLIC_DATA_READINESS_ENABLED=false/);
});

test("Honeyglass dashboard keeps KPI content inside the hexagons and narrow layouts shrinkable", () => {
  const dashboard = readFileSync(new URL("../src/components/dashboard.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/components/workspace-preferences.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

  assert.match(dashboard, /controlsClassName="honeycomb-kpi-controls"/);
  assert.match(dashboard, /xl:grid-cols-\[minmax\(0,1fr\)_22rem\]/);
  assert.match(workspace, /className=\{cn\("min-w-0", className\)\}/);
  assert.match(workspace, /className=\{cn\("min-w-0", itemClassName/);
  assert.match(css, /\.honeycomb-kpi-card \[data-slot="card-header"\][\s\S]*flex-direction: column-reverse/);
  assert.match(css, /\.honeycomb-kpi-card \[data-slot="card-content"\][\s\S]*padding-inline: 3\.4rem/);
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /\.honeycomb-kpi-controls[\s\S]*position: absolute/);
  assert.match(css, /\.dashboard-ai-brief/);
});

test("dashboard readiness contexts deep-link and filter only the intended categories", () => {
  const safety = row({ id: "row-safety-context", message: "Review custody restriction" });
  const billing = row({ id: "row-billing-context", message: "Review family billing responsibility" });
  const historical = row({ id: "row-history-context", message: "Review retained historical note" });
  assert.equal(dataReadinessContextForPath("/family-detail"), "families");
  assert.equal(dataReadinessContextForPath("/billing-invoices"), "billing");
  assert.equal(dataReadinessContextForPath("/parent-portal"), null);
  assert.deepEqual(filterDataReadinessTasksForContext([safety, billing, historical], "billing").map((task) => task.id), ["row:row-billing-context"]);
  assert.deepEqual(filterDataReadinessTasksForContext([safety, billing, historical], "families").map((task) => task.id), ["row:row-safety-context"]);
  assert.deepEqual(dataReadinessViewFilters({ context: "staff" }), {
    tab: "queue",
    status: "actionable",
    risk: "all",
    category: "context:staff",
    sort: "priority",
    context: "staff",
  });
});

test("context summaries reuse one scoped API projection in the shell", () => {
  const shell = readFileSync(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/data-readiness/route.ts", import.meta.url), "utf8");
  assert.match(shell, /dataReadinessContextForPath\(pathname\)/);
  assert.match(shell, /DataReadinessContextPanel context=\{readinessContext\} summary=\{readinessSummary\} loading=\{readinessLoading\}/);
  assert.equal((shell.match(/fetch\(`\/api\/data-readiness\?/g) ?? []).length, 1);
  assert.match(route, /filterDataReadinessTasksForContext\(workspace\.tasks, context\)/);
  assert.match(route, /requestedCategory/);
});
