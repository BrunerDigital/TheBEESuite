import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("async forms retain their form element before awaiting", () => {
  const agency = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  const registration = readFileSync("src/components/online-registration-form.tsx", "utf8");
  assert.doesNotMatch(agency, /await[^;]+;[\s\S]{0,160}event\.currentTarget\.reset\(\)/);
  assert.doesNotMatch(registration, /startTransition\(async \(\) => \{[\s\S]+event\.currentTarget\.reset\(\)/);
  assert.match(`${agency}\n${registration}`, /const formElement = event\.currentTarget/);
});

test("dashboard numbers use a stable locale across server render and hydration", () => {
  const sources = [
    readFileSync("src/components/dashboard.tsx", "utf8"),
    readFileSync("src/components/accounts-receivable-panel.tsx", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /\.toLocaleString\(\)/);
  assert.match(sources, /\.toLocaleString\("en-US"\)/);
});

test("client load recovery refreshes the service worker and clears stale app caches", () => {
  const recovery = readFileSync("src/lib/client-load-recovery.ts", "utf8");
  const appError = readFileSync("src/app/error.tsx", "utf8");
  const globalError = readFileSync("src/app/global-error.tsx", "utf8");
  assert.match(recovery, /getRegistrations/);
  assert.match(recovery, /registration\.update/);
  assert.match(recovery, /key\.startsWith\("bee-suite-"\)/);
  assert.match(appError, /recoverClientAssetsAndReload/);
  assert.match(globalError, /recoverClientAssetsAndReload/);
});
