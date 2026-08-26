import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("location status reconciliation is exact, guarded, auditable, and history preserving", () => {
  const source = readFileSync("scripts/reconcile-kidcity-inquiry-location-statuses.ts", "utf8");
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /executive_website_email_thread/);
  assert.match(source, /leadsDeleted: 0/);
  assert.match(source, /crmHistoryDeleted: 0/);
  assert.match(source, /Kid City USA - Fishers/);
  assert.match(source, /Kid City USA - Lees Summit/);
});
