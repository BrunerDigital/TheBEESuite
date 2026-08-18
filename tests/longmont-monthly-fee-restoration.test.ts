import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/restore-longmont-august-monthly-parent-fees.ts", import.meta.url),
  "utf8",
);
const auditSource = readFileSync(
  new URL("../scripts/audit-longmont-voided-fees.ts", import.meta.url),
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
  assert.match(source, /user\?\.isActive/);
  assert.match(source, /user\.tenantId === center\.organization\.tenantId/);
  assert.match(source, /BILLING_MUTATION_ROLES\.has\(user\.role\)/);
  assert.match(source, /grant\.scopeType === "CENTER"/);
  assert.match(source, /grant\.centerId === CENTER_ID/);
  assert.match(source, /TENANT_WIDE_BILLING_ROLES\.has\(user\.role\) \|\| hasActiveLongmontGrant/);
  assert.match(source, /auditActor/);
  assert.match(source, /db\.tuitionPlan\.findMany/);
  assert.match(source, /plan\?\.centerId === CENTER_ID/);
  assert.match(source, /clean\(plan\.cadence\)\.toLowerCase\(\) === "monthly"/);
  assert.match(source, /plan\.amountCents === positiveItemCents/);
  assert.match(source, /livePlan: plan/);
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

test("Longmont voided-fee audit reports billing logs outside the selected invoice set", () => {
  assert.match(auditSource, /const invoiceIds = new Set\(invoices\.map\(\(invoice\) => invoice\.id\)\)/);
  assert.match(auditSource, /!log\.resourceId \|\| !invoiceIds\.has\(log\.resourceId\)/);
  assert.doesNotMatch(auditSource, /!logsByResource\.has\(log\.resourceId\)/);
});
