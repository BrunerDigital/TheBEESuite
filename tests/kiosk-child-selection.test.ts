import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { updateKioskChildSelection } from "../src/lib/kiosk-child-selection";

test("kiosk selection removes only the child staying at school", () => {
  assert.deepEqual(
    updateKioskChildSelection(["child_leaving", "child_staying"], "child_staying", false),
    ["child_leaving"],
  );
  assert.deepEqual(
    updateKioskChildSelection(["child_leaving"], "child_staying", true),
    ["child_leaving", "child_staying"],
  );
});

test("kiosk checkbox snapshots currentTarget before the deferred state updater", () => {
  const component = readFileSync("src/components/kiosk-check-in.tsx", "utf8");

  assert.match(component, /const selected = event\.currentTarget\.checked;/);
  assert.doesNotMatch(component, /setSelectedIds\(\(current\) => event\.currentTarget/);
});
