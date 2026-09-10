import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  "src/components/parent-portal-workspace.tsx",
  "utf8",
);
const globals = readFileSync("src/app/globals.css", "utf8");
const parentMobileRelease = readFileSync("src/app/parent-mobile-home.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const preview = readFileSync("src/app/device-preview/page.tsx", "utf8");
const previewQa = readFileSync("scripts/qa-device-preview.ts", "utf8");

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

test("mobile parent home uses one status card per child and keeps priority work visible", () => {
  const home = workspace.slice(
    workspace.indexOf('{activeView === "home"'),
    workspace.indexOf('{activeView === "updates"'),
  );

  assert.match(home, /data-parent-home-primary="true"/);
  assert.match(home, /family\.children\.map\(\(child\) =>/);
  assert.doesNotMatch(home, /featuredChildPresent/);
  assert.match(home, /data-parent-home-actions="true"/);
  assert.match(home, /data-parent-home-priority="true"/);
  assert.doesNotMatch(home, /<CollapsiblePanel/);
  assert.match(home, /Read full announcement/);
  assert.match(home, /Hide full announcement/);
  assert.match(home, /group-open:hidden/);
});

test("generic review identities do not create an awkward App greeting", () => {
  assert.match(workspace, /\^\(app\|apple\|demo\|review\|test\)\$/i);
  assert.match(workspace, /: "Welcome back"/);
  assert.match(preview, /scenario === "single-review"/);
  assert.match(preview, /fullName: "App Review Parent"/);
  assert.match(previewQa, /id: "parent-home-single-review"/);
});

test("the fixed mobile navigation leaves safe-area-aware clearance", () => {
  assert.match(
    shell,
    /pb-\[calc\(7rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
});

test("parent mobile overrides ship in a separately invalidated release layer", () => {
  assert.match(
    layout,
    /import "\.\/globals\.css";[\s\S]*import "\.\/product-ui\.css";[\s\S]*import "\.\/parent-mobile-home\.css";/,
  );
  assert.match(parentMobileRelease, /\.dashboard-workspace[\s\S]*background-image: none/);
  assert.match(parentMobileRelease, /\.parent-portal-heading::after[\s\S]*display: none/);
  assert.match(
    parentMobileRelease,
    /parent-portal-heading\[data-parent-heading-view="home"\][\s\S]*background: transparent;[\s\S]*box-shadow: none/,
  );
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
