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
  assert.match(recovery, /recoveredClaimReceivableCount: 0/);
  assert.match(recovery, /recoveredRemittanceReversalCount: 0/);
  assert.match(recovery, /agency-close:claim-evidence/);
  assert.match(recovery, /agency-close:direct-receipt-evidence/);
  assert.match(recovery, /agency-close:remittance-reversal-evidence/);
  assert.match(recovery, /agency-close:adjustment-evidence/);
});
