import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("dashboard shell adapts navigation and toolbar density by device width", () => {
  const shell = source("src/components/app-shell.tsx");
  const refresh = source("src/components/live-refresh-status.tsx");

  assert.match(shell, /lg:block 2xl:hidden/);
  assert.match(shell, /2xl:block/);
  assert.match(shell, /lg:pl-20 2xl:pl-72/);
  assert.match(shell, /hidden min-w-0 flex-1 items-center lg:flex/);
  assert.match(shell, /touch-manipulation lg:hidden/);
  assert.doesNotMatch(shell, /AI suggestions require review/);
  assert.match(shell, /hidden rounded-lg border bg-card\/70 px-3 py-1\.5 text-right 2xl:block/);
  assert.match(shell, /flex min-h-12 touch-manipulation flex-col items-center/);
  assert.match(shell, /env\(safe-area-inset-bottom\)/);
  assert.match(shell, /function ScopeContextLink/);
  assert.match(shell, /"mx-auto grid max-w-md items-end gap-1"/);
  assert.match(shell, /bottomNavItemCount === 4 \? "grid-cols-4"/);
  assert.match(shell, /More for your role/);
  assert.match(shell, /teacher-quick-log/);
  assert.match(refresh, /text-\[0\.68rem\] 2xl:inline-flex/);
});

test("role bottom navigation only renders overflow navigation when destinations remain", () => {
  const shell = source("src/components/app-shell.tsx");

  assert.match(shell, /const bottomNavItemCount = items\.length \+ \(moreItems\.length \? 1 : 0\)/);
  assert.match(shell, /\{moreItems\.length \? <Sheet/);
  assert.match(shell, /bottomNavItemCount === 4 \? "grid-cols-4"/);
  assert.match(shell, /max-h-\[82dvh\] overflow-hidden overscroll-contain/);
  assert.match(shell, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
});

test("dashboard content reflows before constrained laptop and touch layouts", () => {
  const dashboard = source("src/components/dashboard.tsx");
  const css = source("src/app/globals.css");

  assert.match(dashboard, /p-4 shadow-2xl[\s\S]*sm:p-6/);
  assert.match(dashboard, /min-\[112rem\]:grid-cols-\[minmax\(0,1fr\)_28rem\]/);
  assert.match(dashboard, /min-h-11 w-full touch-manipulation sm:min-h-8 sm:w-auto/);
  assert.match(dashboard, /dashboard-ai-brief order-first[\s\S]*min-\[112rem\]:order-none/);
  assert.match(dashboard, /2xl:grid-cols-\[minmax\(0,1fr\)_22rem\]/);
  assert.match(dashboard, /storageId="dashboard-shared-insights"[\s\S]*className="grid gap-6 xl:grid-cols-2"/);
  assert.match(dashboard, /sm:grid-cols-\[minmax\(10rem,14rem\)_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(dashboard, /xl:grid-cols-\[minmax\(0,1fr\)_28rem\]/);
  assert.match(css, /@media \(min-width: 112rem\)[\s\S]*\.honeycomb-kpi-cluster/);
  assert.match(css, /\.honeycomb-kpi-controls button[\s\S]*min-width: 2\.5rem;[\s\S]*min-height: 2\.5rem;/);
});
