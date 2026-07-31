import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the parent portal places authoritative account activity ahead of invoice history", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const latestActivity = source.indexOf("Latest account activity");
  const accountLedger = source.indexOf("Account ledger");
  const invoices = source.indexOf(">Invoice history<");

  assert.ok(latestActivity >= 0);
  assert.ok(accountLedger > latestActivity);
  assert.ok(invoices > accountLedger);
  assert.match(source, /ledgerEntries\.map\(\(entry\)/);
  assert.doesNotMatch(source, /ledgerEntries\.slice\(/);
  assert.match(source, /same charges, credits, payments, adjustments, and running balances used by your school/i);
  assert.match(source, /Use the Balance due and Account ledger above for the amount owed after credits, voids, payments, and adjustments\./);
  assert.match(source, /Posted payments and credits are included\./);
});

test("the parent portal query paginates the family ledger with a stable bounded window", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const parentPortal = source.slice(source.indexOf('if (slug === "parent-portal")'), source.indexOf('if (slug === "center-dashboard")'));
  const ledgerSelection = parentPortal.match(/ledgerEntries:\s*\{[\s\S]*?select:\s*\{[^}]*balanceAfterCents[^}]*\}/)?.[0] ?? "";

  assert.ok(ledgerSelection);
  assert.match(source, /const PARENT_LEDGER_PAGE_SIZE = 50/);
  assert.match(ledgerSelection, /orderBy:\s*\[\{ effectiveAt: "desc" \}, \{ id: "desc" \}\]/);
  assert.match(ledgerSelection, /skip:\s*\(requestedLedgerPage - 1\) \* PARENT_LEDGER_PAGE_SIZE/);
  assert.match(ledgerSelection, /take:\s*PARENT_LEDGER_PAGE_SIZE \+ 1/);
  assert.match(parentPortal, /ledgerEntries\.slice\(0, PARENT_LEDGER_PAGE_SIZE\)/);
  assert.match(parentPortal, /hasNext:\s*\(billingAccount\?\.ledgerEntries\.length \?\? 0\) > PARENT_LEDGER_PAGE_SIZE/);
});

test("the parent portal keeps latest activity accurate while browsing older ledger pages", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const workspace = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");

  assert.match(page, /prisma\.ledgerEntry\.findFirst\([\s\S]*?billingAccount:\s*\{ familyId \}/);
  assert.match(page, /latestLedgerEntry=\{latestLedgerEntry\}/);
  assert.match(workspace, /latestAccountLedgerEntry = latestLedgerEntry \?\? ledgerEntries\[0\] \?\? null/);
  assert.match(workspace, /Page \{ledgerPagination\.page\}/);
  assert.match(workspace, /ledgerPage=\$\{ledgerPagination\.page \+ 1\}/);
});
