import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-oakleaf-current-family-visibility.ts", import.meta.url), "utf8");
const auditSource = readFileSync(new URL("../scripts/audit-oakleaf-family-visibility.ts", import.meta.url), "utf8");
const rosterAuditSource = readFileSync(new URL("../scripts/audit-oakleaf-source-roster.ts", import.meta.url), "utf8");
const withdrawnSource = readFileSync(new URL("../scripts/reconcile-oakleaf-withdrawn-roster.ts", import.meta.url), "utf8");
const balanceAuditSource = readFileSync(new URL("../scripts/audit-oakleaf-balance-vs-weekly.ts", import.meta.url), "utf8");

test("Oakleaf current-family visibility repair is source-locked and financially non-mutating", () => {
  assert.match(source, /SOURCE_SHA256 = "[a-f0-9]{64}"/);
  assert.match(source, /CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6"/);
  assert.match(source, /--confirm-oakleaf-family-visibility/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /weeklyCents: 13_000/);
  assert.match(source, /weeklyCents: 0/);
  assert.match(source, /vpk only child no private charges/i);
  assert.match(source, /zenari - subsidy family \(vpk\)/i);
  assert.match(source, /nextWeeklyBillingPeriod\(new Date\(\)\)/);
  assert.match(source, /balancesToChange: 0/);
  assert.match(source, /invoicesToCreate: 0/);
  assert.match(source, /paymentsToSubmit: 0/);
  assert.match(source, /ledgerEntriesToCreate: 0/);
  assert.doesNotMatch(source, /tx\.invoice\.(?:create|update|delete|upsert)/);
  assert.doesNotMatch(source, /tx\.payment\.(?:create|update|delete|upsert)/);
  assert.doesNotMatch(source, /tx\.ledgerEntry\.(?:create|update|delete|upsert)/);
  assert.match(auditSource, /reviewedVoucher/);
  assert.match(auditSource, /reviewedCombinedResponsibility/);
  assert.match(auditSource, /child\.configured/);
});

test("Oakleaf visibility audit rejects a source whose bytes do not match the reviewed fingerprint", () => {
  assert.match(auditSource, /createHash\("sha256"\)\.update\(sourceBuffer\)\.digest\("hex"\)/);
  assert.match(auditSource, /sourceSha256 === SOURCE_SHA256/);
  assert.match(auditSource, /Oakleaf source fingerprint mismatch/);
});

test("Oakleaf roster audit is locked to the reviewed source bytes", () => {
  assert.match(rosterAuditSource, /SOURCE_SHA256 = "[a-f0-9]{64}"/);
  assert.match(rosterAuditSource, /createHash\("sha256"\)\.update\(sourceBuffer\)\.digest\("hex"\)/);
  assert.match(rosterAuditSource, /sourceSha256 !== SOURCE_SHA256/);
  assert.match(rosterAuditSource, /sourceSha256,/);
  assert.doesNotMatch(rosterAuditSource, /Object\.groupBy/);
  assert.doesNotMatch(balanceAuditSource, /Object\.groupBy/);
});

test("Oakleaf withdrawn-family access compensation is atomic with the financial correction", () => {
  const transactionBody = withdrawnSource.match(/await prisma\.\$transaction\(async \(tx\) => \{([\s\S]*?)\n  \}, \{ isolationLevel/)?.[1] ?? "";
  assert.match(transactionBody, /await tx\.guardian\.update/);
  assert.match(transactionBody, /await tx\.user\.updateMany/);
  assert.match(transactionBody, /parentPortalAccessFields/);
  assert.doesNotMatch(withdrawnSource, /disableParentPortalLoginForGuardian/);
  assert.match(withdrawnSource, /Barnhart compensation guardian is missing or renamed/);
  assert.match(withdrawnSource, /guardians: plan\.family\.guardians\.map/);
});
