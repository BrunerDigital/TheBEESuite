import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("dashboard text uses readable text tokens instead of decorative gold", () => {
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");
  assert.match(dashboard, /text-muted-foreground">\{asOfLabel\}/);
  assert.match(dashboard, /text-foreground underline underline-offset-4[^>]+>View all/);
  assert.doesNotMatch(dashboard, /text-primary">\{asOfLabel\}|text-primary[^>]+>View all/);
  assert.match(dashboard, /group-focus-visible:opacity-100">\s*Open matching leads/);
});

test("named home containers expose a valid semantic group", () => {
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");
  const parent = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(dashboard, /role="group" aria-labelledby="dashboard-primary-actions"/);
  assert.match(parent, /role="group"\s+aria-label="Children’s status today"/);
});

test("mobile alert labels remain concise without changing permission or route scope", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.equal((shell.match(/label: "Alerts", href: "\/notifications", slug: "notifications"/g) ?? []).length, 2);
  assert.match(shell, /sourceItems\.filter\(\(item\) => canAccessShellModule\(currentUser, item\.slug\)\)/);
});

test("home QA screenshots do not inject caret styles during hydration", () => {
  for (const file of ["scripts/qa-home-accessibility.ts", "scripts/qa-role-home-refinement.ts", "scripts/qa-device-preview.ts"]) {
    const source = readFileSync(file, "utf8");
    const captures = source.match(/page\.screenshot\([^\n]+/g) ?? [];
    assert.ok(captures.length > 0);
    for (const capture of captures) assert.match(capture, /caret: "initial"/, file);
  }
});
