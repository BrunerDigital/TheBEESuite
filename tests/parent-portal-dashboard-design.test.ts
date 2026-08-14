import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  "src/components/parent-portal-workspace.tsx",
  "utf8",
);
const globals = readFileSync("src/app/globals.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");

test("parent dashboard keeps its balance card on the guarded family balance", () => {
  assert.match(workspace, /const balanceCents = billingAccount\?\.balanceCents \?\? 0/);
  assert.match(workspace, /Account &amp; Payments/);
  assert.match(workspace, /\{money\(balanceCents\)\}/);
  assert.match(workspace, /parentBalanceReviewRequired \? \(/);
  assert.match(workspace, /workspaceHref\("payments", \{ familyId: family\.id \}\)/);
  assert.doesNotMatch(
    workspace.slice(
      workspace.indexOf('{activeView === "home"'),
      workspace.indexOf('{activeView === "updates"'),
    ),
    /\/api\/billing\//,
  );
});

test("parent dashboard preserves every primary destination in responsive navigation", () => {
  for (const destination of [
    "Photos & Daily Reports",
    "Message the School",
    "View Payments",
    "School Check-In",
  ]) {
    assert.match(workspace, new RegExp(destination.replace("&", "\\&")));
  }
});

test("mobile parent summaries stay compact without removing detail", () => {
  assert.match(workspace, /snap-x snap-mandatory/);
  assert.match(workspace, /View day details/);
  assert.match(workspace, /View account history/);
  assert.match(workspace, /grid grid-cols-2 gap-3 xl:grid-cols-4/);
  assert.match(workspace, /Schedule[\s\S]*Classroom[\s\S]*Last Check-In[\s\S]*Daily Update/);
  assert.match(workspace, /Account activity[\s\S]*Recent payments/);
});

test("warm portal styling stays scoped to parent-facing roles", () => {
  assert.match(globals, /data-role="PARENT_GUARDIAN"/);
  assert.match(globals, /data-role="AUTHORIZED_PICKUP"/);
  assert.match(globals, /\.parent-portal-workspace/);
  assert.match(globals, /--portal-canvas/);
});

test("parent portal follows iOS viewport, safe-area, and touch-target basics", () => {
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(shell, /safe-area-inset-top/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.match(globals, /touch-action: manipulation/);
  assert.match(globals, /min-height: 2\.75rem/);
  assert.match(globals, /font-size: 1rem/);
});

test("billing administration lives in Family while Payments links to it", () => {
  assert.match(workspace, /activeFamilySection === "billing"/);
  assert.match(workspace, /Billing Settings/);
  assert.match(workspace, /section: "billing"/);
  assert.match(workspace, /Return to Payments/);
});
