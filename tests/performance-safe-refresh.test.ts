import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("session heartbeats preserve sign-out handling and refresh live billing only", () => {
  const liveRefresh = source("src/components/live-refresh-status.tsx");
  const billingVersion = source("src/app/api/billing/live-version/route.ts");

  assert.equal(liveRefresh.match(/router\.refresh\(\)/g)?.length, 2);
  assert.doesNotMatch(liveRefresh, /sync\((true|false)\)/);
  assert.match(liveRefresh, /response\.status === 401/);
  assert.match(liveRefresh, /pathname\.startsWith\("\/billing-invoices"\)\) return 15_000/);
  assert.match(liveRefresh, /fetch\("\/api\/billing\/live-version", \{ cache: "no-store" \}\)/);
  assert.match(liveRefresh, /previousVersion && nextVersion && previousVersion !== nextVersion/);
  assert.match(billingVersion, /canAccessModule\(user, "billing-invoices"\)/);
  assert.match(billingVersion, /canAccessModule\(user, "payments"\)/);
  assert.match(billingVersion, /FROM pg_stat_user_tables/);
  assert.match(billingVersion, /n_tup_ins::text AS inserted/);
  assert.match(billingVersion, /n_tup_upd::text AS updated/);
  assert.match(billingVersion, /n_tup_del::text AS deleted/);
  assert.match(billingVersion, /'Payment', 'Invoice', 'LedgerEntry'/);
  assert.doesNotMatch(billingVersion, /prisma\.payment\.(?:findMany|groupBy)/);
  assert.match(billingVersion, /createHash\("sha256"\)/);
  assert.match(billingVersion, /user\.centerIds\.length/);
  assert.match(billingVersion, /"Cache-Control": "private, no-store"/);
});

test("notification polling uses the lightweight unread endpoint", () => {
  const appShell = source("src/components/app-shell.tsx");
  const summaryRoute = source("src/app/api/notifications/summary/route.ts");
  const countMode = summaryRoute.indexOf('searchParams.get("mode") === "count"');
  const centerLookup = summaryRoute.indexOf("prisma.center.findMany");

  assert.match(appShell, /notifications\/summary\?mode=count/);
  assert.match(appShell, /notificationAccessRef\.current = false/);
  assert.match(appShell, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(appShell, /setSummary\(null\)/);
  assert.match(appShell, /NotificationDropdown key=\{`\$\{currentUser\?\.id \?\? currentUser\?\.email\}:\$\{currentUser\?\.role\}`\}/);
  assert.match(appShell, /notificationAccessRef\.current && mountedRef\.current && json\?\.ok/);
  assert.match(appShell, /onOpenChange=\{\(open\)/);
  assert.ok(countMode > -1);
  assert.ok(centerLookup > countMode, "count mode must return before the multi-center summary queries");
});

test("dashboard routes expose loading boundaries and passive speed telemetry", () => {
  assert.match(source("src/app/dashboard/loading.tsx"), /\.\.\/loading/);
  assert.match(source("src/app/[slug]/loading.tsx"), /\.\.\/loading/);
  assert.match(source("src/app/layout.tsx"), /<SpeedInsights \/>/);
});
