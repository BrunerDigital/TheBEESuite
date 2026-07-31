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

test("the parent portal query does not truncate the family ledger", () => {
  const source = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const parentPortal = source.slice(source.indexOf('if (slug === "parent-portal")'), source.indexOf('if (slug === "center-dashboard")'));
  const ledgerSelection = parentPortal.match(/ledgerEntries:\s*\{[\s\S]*?select:\s*\{[^}]*balanceAfterCents[^}]*\}/)?.[0] ?? "";

  assert.ok(ledgerSelection);
  assert.doesNotMatch(ledgerSelection, /take:/);
});
