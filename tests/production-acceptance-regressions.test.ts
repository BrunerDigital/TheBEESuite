import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the shared workspace control names its change action", () => {
  const shell = source("src/components/app-shell.tsx");
  const labels = shell.match(/aria-label=\{`\$\{label\}\. \$\{detail\}\. Change workspace\.`\}/g) ?? [];
  assert.equal(labels.length, 2);
});

test("CRM contains its wide desktop columns within the application frame", () => {
  const crm = source("src/components/crm/crm-workspace.tsx");
  const containedDesktopGrids = crm.match(/grid min-w-0[^\n]*xl:grid-cols-\[minmax\(0,1fr\)_22rem\]/g) ?? [];
  assert.equal(containedDesktopGrids.length, 2);
  assert.match(crm, /<div className="min-w-0 p-5 sm:p-6">/);
  assert.match(crm, /<div className="min-w-0 border-t bg-primary\/10 p-5/);
  assert.match(crm, /<div className="flex min-w-0 flex-col gap-4">/);
  assert.match(crm, /<aside className="flex min-w-0 flex-col gap-4">/);
  assert.match(crm, /<input\s+id=\{emailAttachmentsId\}\s+type="file"\s+multiple\s+className="sr-only"/);
});

test("setup graphics remain native document links without route prefetch", () => {
  const checklist = source("src/components/setup-checklist-panel.tsx");
  assert.match(checklist, /render=\{<a href=\{graphicHref\} target="_blank" rel="noreferrer" \/>\}/);
  assert.doesNotMatch(checklist, /render=\{<Link href=\{graphicHref\}/);
});

test("blocked parent access remains oriented with a page heading", () => {
  const blocked = source("src/components/parent-portal-access-blocked.tsx");
  const workspace = source("src/components/parent-portal-workspace.tsx");
  assert.match(blocked, /<h1[^>]*>Family access needs review<\/h1>/);
  assert.match(workspace, /<CardTitle as="h1">Family access is not connected yet<\/CardTitle>/);
  assert.match(workspace, /No family or child information is shown until that connection is confirmed\./);
});

test("agency authorization and claim fields have associated labels", () => {
  const agency = source("src/components/agency-subsidy-workspace.tsx");
  for (const id of [
    "agency-subsidy-school",
    "agency-setup-program",
    "authorization-agency-program",
    "authorization-family",
    "authorization-child",
    "authorization-coverage-start",
    "authorization-coverage-end",
    "authorization-agency-rate",
    "authorization-family-copay",
    "authorization-rate-unit",
    "authorization-units",
    "claim-authorization",
    "claim-service-start",
    "claim-service-end",
    "claim-service-units",
    "claim-rate-override",
    "claim-attendance-days",
    "claim-due-date",
  ]) {
    assert.match(agency, new RegExp(`<Label htmlFor="${id}">`), `${id} needs an associated label`);
    assert.match(agency, new RegExp(`<(?:Input|select|SelectTrigger)[^>]*id="${id}"`), `${id} needs a matching control`);
  }
  assert.match(agency, /role="status"[^>]*>\{message\}/);
});
