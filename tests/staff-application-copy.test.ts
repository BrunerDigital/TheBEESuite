import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const shell = source("src/components/app-shell.tsx");
const teacher = source("src/components/teacher-mobile-workspace.tsx");
const kiosk = source("src/components/kiosk-check-in.tsx");
const admin = source("src/components/executive-admin-console.tsx");
const liveOps = source("src/components/live-ops-pages.tsx");
const workspaceNav = source("src/components/consolidated-workspace-nav.tsx");
const errorPage = source("src/app/error.tsx");
const globalErrorPage = source("src/app/global-error.tsx");
const notFoundPage = source("src/app/not-found.tsx");

test("staff and administrative surfaces do not expose implementation or prototype copy", () => {
  const surfaces = [shell, teacher, kiosk, admin, liveOps, workspaceNav, errorPage, globalErrorPage, notFoundPage].join("\n");

  assert.doesNotMatch(
    surfaces,
    /AI can help draft wording|AI Command Center|live operating layer|idempotent invoice generation|tuition billing cron route|CRM database|Successful webhooks|New session version|role-scoped|internal draft|queued for director review|visible to your role|More for your role|Something went wrong|parent and family workspace/i,
  );
});

test("shared navigation names the destination and accessible action", () => {
  assert.match(shell, /label: "Notifications", href: "\/notifications"/);
  assert.match(shell, /"Family portal navigation" : "Primary navigation"/);
  assert.match(shell, /aria-label="Search The BEE Suite"/);
  assert.match(shell, /aria-label="Open quick navigation"/);
  assert.match(shell, /<DialogTitle>Quick navigation<\/DialogTitle>/);
});

test("teacher mobile copy identifies saved visibility and repeated-field controls", () => {
  assert.match(teacher, /saved as a staff-only draft/);
  assert.match(teacher, /sent to the director for review/);
  assert.match(teacher, /aria-label=\{`Meal \$\{index \+ 1\} amount`\}/);
  assert.match(teacher, /aria-label=\{`Diaper or potty entry \$\{index \+ 1\} time`\}/);
  assert.match(teacher, /aria-label=\{`Remove activity \$\{index \+ 1\}`\}/);
  assert.match(teacher, /Save daily report/);
  assert.match(teacher, /Send incident report/);
});

test("kiosk choices and recovery states use explicit labels", () => {
  assert.match(kiosk, /Family check-in/);
  assert.match(kiosk, /Staff time clock/);
  assert.match(kiosk, /Enter PIN/);
  assert.match(kiosk, /Scan QR code/);
  assert.match(kiosk, /Verify Family PIN/);
  assert.match(kiosk, /Camera unavailable/);
  assert.match(kiosk, /Directors can review completed clock-in and clock-out records/);
});

test("administrative copy formats display labels without changing stored values", () => {
  assert.match(admin, /function userRoleLabel/);
  assert.match(admin, /function accessScopeLabel/);
  assert.match(admin, /Copy login details/);
  assert.match(admin, /Sign out devices/);
  assert.match(admin, /Password requirements follow the selected account type/);
  assert.match(admin, /next sign-in follows that account/);
  assert.doesNotMatch(admin, /must choose a private password before signing in|required to replace the password before signing in|Password resets also require the user to replace credentials/);
  assert.match(liveOps, /formatRecordLabel\(invoice\.status\)/);
  assert.match(liveOps, /formatRecordLabel\(payment\.status\)/);
  assert.match(liveOps, /new Set\(\["FTE", "SMS", "API", "ACH", "ID", "URL", "QR"\]\)/);
  assert.match(liveOps, /formatRecordLabel\(item\.priority\)/);
  assert.match(liveOps, /Review incident details, parent notification, and acknowledgment status/);
  assert.match(liveOps, /Delivery did not complete\. Review the destination and try again\./);
  assert.equal(liveOps.includes(">{delivery.lastError}</div>"), false);
});

test("global fallback pages provide role-neutral recovery copy", () => {
  assert.match(errorPage, /We couldn&apos;t load this page/);
  assert.match(globalErrorPage, /We couldn&apos;t load this page/);
  assert.match(notFoundPage, /The link may be outdated, or the page may have moved/);
  assert.doesNotMatch(notFoundPage, /parent and family workspace/i);
});
