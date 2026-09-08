import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeTestHelper = fileURLToPath(
  new URL("./helpers/agency-period-close-recovery-route-module-mocks.mjs", import.meta.url),
);

test("period close recovery is fail-closed except for exact controlled-batch receipts", () => {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
  };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--test",
      routeTestHelper,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnv,
    },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /fails closed for claim-conflict/i);
  assert.match(result.stdout, /fails closed for direct-conflict/i);
  assert.match(result.stdout, /fails closed for controlled-conflict/i);
  assert.match(result.stdout, /fails closed for reversal-conflict/i);
  assert.match(result.stdout, /fails closed for adjustment-conflict/i);
  assert.match(result.stdout, /recovers only a fully evidenced controlled-batch receipt/i);
  assert.match(result.stdout, /baseline direct remittance is blocked before writes/i);
  assert.match(result.stdout, /claim-linked adjustment rejects a draft or otherwise nonfinancial claim/i);
});

test("period close source contains no approval, direct-receipt, adjustment, or reversal synthesis", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const recovery = route.slice(
    route.indexOf("async function recoverMissingAgencyLedgerCutoverEvents"),
    route.indexOf("type AgencyPostingClaim"),
  );

  assert.doesNotMatch(recovery, /INSERT INTO "AgencyLedgerAccount"/);
  assert.doesNotMatch(recovery, /'agency-ledger-claim:' \|\|/);
  assert.doesNotMatch(recovery, /'agency-ledger-remittance-reversal:' \|\|[\s\S]*INSERT INTO/);
  assert.equal((recovery.match(/INSERT INTO "AgencyLedgerEntry"/g) ?? []).length, 1);
  assert.match(recovery, /agency-close:controlled-receipt-recovery/);
  assert.match(recovery, /COALESCE\(allocation\."reviewedAt", remittance\."paidAt"\)/);
  assert.match(recovery, /legacy-allocation:adoption:/);
  assert.match(recovery, /expectedLegacyBatchId/);
  assert.match(recovery, /recoveredClaimReceivableCount: 0/);
  assert.match(recovery, /recoveredRemittanceReversalCount: 0/);
  assert.match(recovery, /agency-close:claim-evidence/);
  assert.match(recovery, /agency-close:direct-receipt-evidence/);
  assert.match(recovery, /agency-close:remittance-reversal-evidence/);
  assert.match(recovery, /agency-close:adjustment-evidence/);
});

test("period close preserves exact legacy unknown snapshots without weakening controlled recovery", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const recovery = route.slice(
    route.indexOf("async function recoverMissingAgencyLedgerCutoverEvents"),
    route.indexOf("type AgencyPostingClaim"),
  );
  const precheck = recovery.slice(
    recovery.indexOf("agency-close:controlled-receipt-precheck"),
    recovery.indexOf("agency-close:controlled-receipt-recovery"),
  );
  const insert = recovery.slice(
    recovery.indexOf("agency-close:controlled-receipt-recovery"),
    recovery.indexOf("agency-close:controlled-receipt-postcheck"),
  );
  const postcheck = recovery.slice(
    recovery.indexOf("agency-close:controlled-receipt-postcheck"),
    recovery.indexOf("agency-close:remittance-reversal-evidence"),
  );

  assert.match(precheck, /NULLIF\(BTRIM\(expected\."cashGlCodeSnapshot"\), ''\) IS NOT NULL[\s\S]*expected\."batchReviewedAt" IS NOT NULL/);
  assert.match(precheck, /legacy-allocation:adoption:[\s\S]*expected\."cashGlCodeSnapshot" IS NULL OR NULLIF\(BTRIM\(expected\."cashGlCodeSnapshot"\), ''\) IS NOT NULL/);
  assert.match(precheck, /legacy-allocation:adoption:[\s\S]*expected\."costCenterCodeSnapshot" IS NULL OR NULLIF\(BTRIM\(expected\."costCenterCodeSnapshot"\), ''\) IS NOT NULL/);
  assert.match(precheck, /entry\."glCodeSnapshot" IS NOT DISTINCT FROM expected\."cashGlCodeSnapshot"/);
  assert.match(precheck, /entry\."costCenterCodeSnapshot" IS NOT DISTINCT FROM expected\."costCenterCodeSnapshot"/);

  // A missing receipt with unknown event-time mappings remains unrecoverable.
  assert.match(insert, /NULLIF\(BTRIM\(batch\."cashGlCodeSnapshot"\), ''\) IS NOT NULL/);
  assert.match(insert, /NULLIF\(BTRIM\(batch\."costCenterCodeSnapshot"\), ''\) IS NOT NULL/);
  assert.match(postcheck, /entry\."glCodeSnapshot" IS NOT DISTINCT FROM expected\."cashGlCodeSnapshot"/);
  assert.match(postcheck, /entry\."costCenterCodeSnapshot" IS NOT DISTINCT FROM expected\."costCenterCodeSnapshot"/);
  assert.doesNotMatch(postcheck, /entry\."glCodeSnapshot" = expected\."cashGlCodeSnapshot"/);
  assert.doesNotMatch(postcheck, /entry\."costCenterCodeSnapshot" = expected\."costCenterCodeSnapshot"/);
});
