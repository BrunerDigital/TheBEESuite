import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/restore-longmont-august-monthly-parent-fees.ts", import.meta.url),
  "utf8",
);

test("Longmont monthly fee restoration is exact, fingerprinted, and approval gated", () => {
  assert.match(source, /Kid City USA - Longmont/);
  assert.equal(source.match(/\["INV-20260813-/g)?.length, 16);
  assert.match(source, /EXPECTED_TOTAL_CENTS = 233_500/);
  assert.match(source, /--confirm-longmont-august-monthly-fee-restoration/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /centerBillingApproval/);
  assert.match(source, /livePaymentsEnabled: centerFields\.livePaymentsEnabled === true/);
  assert.match(source, /tuitionBillingEnabled: centerFields\.tuitionBillingEnabled === true/);
  assert.match(source, /stripeBillingApproved: centerFields\.stripeBillingApproved === true/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
});

test("Longmont monthly fee restoration preserves payment and external-provider history", () => {
  assert.match(source, /JSON\.stringify\(current\.payments\) === JSON\.stringify\(target\.payments\)/);
  assert.match(source, /externalChargesOrRefunds: 0/);
  assert.match(source, /messagesSent: 0/);
  assert.doesNotMatch(
    source,
    /tx\.payment\.(?:create|update|upsert|delete)/,
  );
});
