import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../scripts/reconcile-cordera-pdf-balances.ts", import.meta.url),
  "utf8",
);

test("Cordera PDF balance reconciliation is source-locked and history-preserving", () => {
  assert.match(source, /--confirm-cordera-pdf-balances/);
  assert.match(source, /--confirm-preserve-payments-and-invoices/);
  assert.match(source, /c501f8b2c4cdfb9a7ff2e299ab4d0b81140cab46e41cb1a57a67de4be993a52d/);
  assert.match(source, /765209f82fd364f48449b05c6ca68444c49531e3d84bb04c6de9785053518e03/);
  assert.match(source, /1f77fe24c5d60c8d66448576fe7bd9b3769daa17d6dbbacae0c09504cb197538/);
  assert.match(source, /cordera-balance-plan\.json/);
  assert.doesNotMatch(source, /const SOURCE_ROWS: SourceRow\[\] = \[/);
  assert.match(source, /EXPECTED_SOURCE_ROWS = 52/);
  assert.match(source, /EXPECTED_VISIBLE_CENTS = 77_900/);
  assert.match(source, /EXPECTED_HIDDEN_CENTS = 374_600/);
  assert.match(source, /EXPECTED_TOTAL_CENTS = 452_500/);
  assert.match(source, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(source, /billing\.cordera_pdf_balance_reconciled/);
  assert.match(source, /paymentsMutated: false/);
  assert.match(source, /invoicesMutated: false/);
  assert.doesNotMatch(source, /payment\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /invoice\.(?:create|update|delete)/);
});

test("unmatched Cordera identity and access remain outside the balance repair", () => {
  assert.match(source, /missingNonzeroShells/);
  assert.match(source, /unmatchedZeroRows/);
  assert.match(source, /billingOnlyShell: true/);
  assert.match(source, /childAssignmentHeld: true/);
  assert.match(source, /guardianCreationHeld: true/);
  assert.match(source, /accessCreated: false/);
  assert.match(source, /invitationsSent: false/);
  assert.doesNotMatch(source, /tx\.child\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /tx\.guardian\.(?:create|update|delete)/);
});
