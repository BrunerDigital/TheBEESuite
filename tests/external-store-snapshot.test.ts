import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser-saved dashboard and enrollment views use stable server snapshots", () => {
  const dashboard = readFileSync("src/components/dashboard-snapshot-controls.tsx", "utf8");
  const enrollment = readFileSync("src/components/crm/crm-workspace.tsx", "utf8");

  assert.match(dashboard, /const serverDashboardViewsSnapshot: DashboardSnapshotView\[\] = \[\];/);
  assert.match(dashboard, /function getServerDashboardViewsSnapshot\(\) \{\s*return serverDashboardViewsSnapshot;/);
  assert.match(enrollment, /const serverCrmSavedViewsSnapshot: CrmSavedView\[\] = \[\];/);
  assert.match(enrollment, /function getServerCrmSavedViewsSnapshot\(\) \{\s*return serverCrmSavedViewsSnapshot;/);
});
