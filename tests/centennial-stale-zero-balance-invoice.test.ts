import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../scripts/reconcile-centennial-stale-zero-balance-invoice.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Centennial stale invoice repair is exact, fingerprinted, and idempotent", () => {
  assert.match(source, /cms3g2the000i6a7wdd8pa20s/);
  assert.match(source, /cms3lo7s802hz6avw9guji3ym/);
  assert.match(source, /cms7g6a2h002nl704ksqf77sx/);
  assert.match(source, /cmsgdw3rh0019l304foznm1jg/);
  assert.match(source, /INV-20260805-A64EB178/);
  assert.match(source, /INVOICE_TOTAL_CENTS = 45_200/);
  assert.equal(source.match(/name === "Behrin Family"/g)?.length, 2);
  assert.match(source, /--confirm-centennial-stale-zero-balance-invoice/);
  assert.match(source, /--confirm-fingerprint/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /alreadyApplied/);
  assert.match(source, /scopedGuardianFamilyCount === 2/);
});

test("Centennial stale invoice repair preserves financial history and both balances", () => {
  assert.match(source, /duplicate\.billingAccount\?\.balanceCents === 0/);
  assert.match(source, /if \(alreadyApplied\)[\s\S]*else \{[\s\S]*current\.billingAccount\?\.balanceCents === 0/);
  assert.match(source, /balanceMutationCents: 0/);
  assert.match(source, /paymentsMutated: 0/);
  assert.match(source, /ledgerEntriesMutated: 0/);
  assert.match(source, /staleDuplicateInvoiceBalancePreserved: true/);
  assert.doesNotMatch(
    source,
    /tx\.billingAccount\.(?:create|update|upsert|delete)/,
  );
  assert.doesNotMatch(
    source,
    /tx\.(?:payment|ledgerEntry)\.(?:create|update|upsert|delete)/,
  );
  assert.doesNotMatch(
    source,
    /tx\.(?:family|child|guardian|user)\.(?:create|update|upsert|delete)/,
  );
});
