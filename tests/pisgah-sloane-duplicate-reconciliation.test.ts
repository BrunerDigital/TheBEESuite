import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-pisgah-sloane-duplicate.ts", import.meta.url), "utf8");

test("Pisgah Sloane reconciliation is exact-targeted and fingerprint guarded", () => {
  assert.match(source, /centerId: "cmp4ewg8w004k6alwid0bwiur"/);
  assert.match(source, /familyId: "cms7g820e003d6a44w4gtdz44"/);
  assert.match(source, /primaryChildId: "cmta4xzkj000ql2047bsalb8t"/);
  assert.match(source, /duplicateChildId: "cmta5fp7y000gl5045aoqbu39"/);
  assert.match(source, /evidenceMessageId: "1a03e5f22e908367"/);
  assert.match(source, /--expected-fingerprint/);
  assert.match(source, /locked\.fingerprint === before\.fingerprint/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
});

test("Pisgah Sloane reconciliation refuses linked history and preserves merge provenance", () => {
  assert.match(source, /Object\.values\(duplicate\._count\)\.every\(\(count\) => count === 0\)/);
  assert.match(source, /duplicate\.liveLocation === null/);
  assert.match(source, /mergedChildIds/);
  assert.match(source, /operations\.childMerge\.merged/);
  assert.match(source, /billingChanged: false/);
  assert.match(source, /paymentHistoryChanged: false/);
  assert.match(source, /familyHistoryChanged: false/);
  assert.match(source, /duplicate === null/);
});
