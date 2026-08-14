import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("session heartbeats preserve sign-out handling without refreshing successful pages", () => {
  const liveRefresh = source("src/components/live-refresh-status.tsx");

  assert.equal(liveRefresh.match(/router\.refresh\(\)/g)?.length, 1);
  assert.doesNotMatch(liveRefresh, /sync\((true|false)\)/);
  assert.match(liveRefresh, /response\.status === 401/);
});

test("notification polling uses the lightweight unread endpoint", () => {
  const appShell = source("src/components/app-shell.tsx");
  const summaryRoute = source("src/app/api/notifications/summary/route.ts");
  const countMode = summaryRoute.indexOf('searchParams.get("mode") === "count"');
  const centerLookup = summaryRoute.indexOf("prisma.center.findMany");

  assert.match(appShell, /notifications\/summary\?mode=count/);
  assert.match(appShell, /notificationAccessRef\.current = false/);
  assert.match(appShell, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(appShell, /onOpenChange=\{\(open\)/);
  assert.ok(countMode > -1);
  assert.ok(centerLookup > countMode, "count mode must return before the multi-center summary queries");
});

test("dashboard routes expose loading boundaries and passive speed telemetry", () => {
  assert.match(source("src/app/dashboard/loading.tsx"), /\.\.\/loading/);
  assert.match(source("src/app/[slug]/loading.tsx"), /\.\.\/loading/);
  assert.match(source("src/app/layout.tsx"), /<SpeedInsights \/>/);
});
