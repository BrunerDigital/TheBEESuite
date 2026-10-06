import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { balanceViewTotals, familyBillingActionHref, filterAgencyBalances, filterBalanceAccounts, type AgencyBalanceSummary } from "../src/lib/balance-follow-up";
import { buildAccountsReceivableSnapshot } from "../src/lib/accounts-receivable";

const snapshot = buildAccountsReceivableSnapshot([
  { id: "due", name: "Due Family", centerId: "school-a", billingAccount: { id: "a", balanceCents: 10000, invoices: [{ id: "invoice", dueDate: new Date("2026-09-01") }] } },
  { id: "processing", name: "Pending Family", centerId: "school-a", billingAccount: { id: "b", balanceCents: 5000, invoices: [], payments: [{ amountCents: 5000, provider: "stripe", status: "DRAFT", customFields: { paymentMethodCategory: "ach", status: "paid_processing" } }] } },
  { id: "credit", name: "Credit Family", centerId: "school-b", billingAccount: { id: "c", balanceCents: -2000, invoices: [{ id: "old", dueDate: new Date("2026-09-01") }] } },
  { id: "zero", name: "Settled Family", centerId: "school-b", billingAccount: null },
], { "school-a": "First School", "school-b": "Second School" }, new Date("2026-10-06"));

test("balance follow-up excludes processing payments without hiding their unsettled ledger balance", () => {
  assert.deepEqual(filterBalanceAccounts(snapshot.accounts, "follow_up").map((account) => account.familyId), ["due"]);
  assert.equal(filterBalanceAccounts(snapshot.accounts, "owes").length, 2);
  assert.equal(filterBalanceAccounts(snapshot.accounts, "processing")[0].balanceCents, 5000);
  assert.deepEqual(filterBalanceAccounts(snapshot.accounts, "overdue").map((account) => account.familyId), ["due"]);
  assert.equal(filterBalanceAccounts(snapshot.accounts, "current")[0].familyId, "zero");
});

test("filtered report totals follow the school search and preserve credits separately", () => {
  const accounts = filterBalanceAccounts(snapshot.accounts, "all", " second school ");
  assert.deepEqual(balanceViewTotals(accounts), { owedCents: 0, creditCents: -2000, netCents: -2000, owingCount: 0, currentCount: 1, overdueCount: 0 });
  assert.equal(filterBalanceAccounts(snapshot.accounts, "owes", "missing").length, 0);
  assert.equal(familyBillingActionHref({ ...snapshot.accounts[0], familyId: "a&b", centerId: "x y" }, "family-ledger"), "/billing-invoices?familyId=a%26b&centerId=x%20y#family-ledger");
});

test("agency filters keep draft submission and unapplied deposits visible without counting them as family debt", () => {
  const agency: AgencyBalanceSummary = { id: "agency", centerId: "school-a", centerName: "First School", agencyName: "CCS", outstandingCents: 8000, receivedCents: 2000, needsSubmissionCount: 0, awaitingPaymentCount: 1, overdueCount: 1, ledgerBalanceCents: 8000, pendingReviewCount: 0, unappliedCents: 0 };
  const accounts = [agency, { ...agency, id: "draft", outstandingCents: 0, overdueCount: 0, needsSubmissionCount: 2 }, { ...agency, id: "deposit", outstandingCents: 0, overdueCount: 0, unappliedCents: 3000 }];
  assert.deepEqual(filterAgencyBalances(accounts, "outstanding").map((account) => account.id), ["agency"]);
  assert.deepEqual(filterAgencyBalances(accounts, "overdue").map((account) => account.id), ["agency"]);
  assert.deepEqual(filterAgencyBalances(accounts, "submission").map((account) => account.id), ["draft"]);
  assert.deepEqual(filterAgencyBalances(accounts, "reconciliation").map((account) => account.id), ["deposit"]);
  assert.equal(filterAgencyBalances(accounts, "all", "CCS").length, 3);
  assert.equal(snapshot.totalOwedCents, 15000);
});

test("reminder API previews are scoped and revalidate balance and payment status before any send", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx", "--test", fileURLToPath(new URL("./helpers/balance-reminder-route-mocks.mjs", import.meta.url))], { cwd: process.cwd(), encoding: "utf8", env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
