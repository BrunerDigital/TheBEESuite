import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/repair-centennial-family-profiles.ts", import.meta.url), "utf8");

test("Centennial family repair is source-locked, guarded, and explicitly confirmed", () => {
  assert.match(source, /--confirm-centennial-family-profiles/);
  assert.match(source, /Child All Enrollment Status\.csv/);
  assert.match(source, /02-procare-needs-account-resolution\.csv/);
  assert.match(source, /sha256\(source\.path\) === source\.sha256/);
  assert.match(source, /assertPreRepair\(before\)/);
  assert.match(source, /assertPostRepair\(after, before\)/);
});

test("Centennial family repair preserves billing and independent activation gates", () => {
  assert.match(source, /billingBalancesChanged: false/);
  assert.match(source, /paymentsChanged: false/);
  assert.match(source, /invoicesChanged: false/);
  assert.match(source, /authChanged: false/);
  assert.match(source, /invitationsChanged: false/);
  assert.match(source, /messagesChanged: false/);
  assert.doesNotMatch(source, /supabaseAuth/);
  assert.doesNotMatch(source, /sendParent/);
});

test("Centennial family repair keeps the two source-backed pre-registered children pending", () => {
  assert.match(source, /pendingChildrenIntentionallyRetained: \["Averly Wisdom", "Callen Gnacinski"\]/);
  assert.match(source, /Only Averly Wisdom and Callen Gnacinski should remain pending/);
});
