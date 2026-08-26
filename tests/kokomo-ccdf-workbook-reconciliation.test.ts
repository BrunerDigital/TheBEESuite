import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../scripts/reconcile-kokomo-ccdf-workbook.ts", import.meta.url), "utf8");

test("Kokomo CCDF reconciliation is exact-targeted, fingerprinted, locked, and auditable", () => {
  assert.match(source, /centerId: "cmp4ewela003u6alw9ii7uffs"/);
  assert.match(source, /programId: "agency_6ad29b2fac95ab453b206817"/);
  assert.match(source, /evidenceMessageId: "1a03e80a5ee75b78"/);
  assert.match(source, /evidenceSha256: "2D0B78F7A97EBE1A431CE1706EFFC8A10A988D33631F5BBB997BCDC6B28C49BF"/);
  assert.match(source, /--confirm-fingerprint=/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /TransactionIsolationLevel\.Serializable/);
  assert.match(source, /corrected_from_director_workbook/);
});

test("Kokomo CCDF reconciliation corrects only supported authorization and draft-claim fields", () => {
  assert.match(source, /familyCopayCents: 7_500/);
  assert.match(source, /coverageStart: d\("2026-07-19"\)/);
  assert.match(source, /historicalAuthorizationNumber: "11495701"/);
  assert.match(source, /authorizationNumber: "11494621"/);
  assert.match(source, /coverageStart: d\("2026-07-19"\), coverageEnd: d\("2026-10-03"\)/);
  assert.match(source, /authorizationNumber: "11515993"/);
  assert.match(source, /claimedCents: 13_500/);
  assert.match(source, /serviceUnits: 1/);
  assert.match(source, /statusPreserved: "draft"/);
});

test("Kokomo CCDF reconciliation cannot manufacture financial settlement", () => {
  assert.doesNotMatch(source, /subsidyRemittance\.(create|update)/);
  assert.doesNotMatch(source, /billingAccount\.(create|update)/);
  assert.doesNotMatch(source, /ledgerEntry\.(create|update)/);
  assert.doesNotMatch(source, /payment\.(create|update)/);
  assert.doesNotMatch(source, /invoice\.(create|update)/);
  assert.match(source, /remittancesCreated: 0/);
  assert.match(source, /claimsMarkedPaid: 0/);
  assert.match(source, /parentBalancesChanged: 0/);
  assert.match(source, /Tyler Technologies remittance transaction\/reference ID/);
});

test("Kokomo CCDF reconciliation enumerates every non-void claim and revalidates authorization, child, and actor scope", () => {
  assert.match(source, /authorizationId: \{ in: authorizationIds \}, status: \{ not: "void" \}/);
  assert.match(source, /Expected only the two reviewed non-void draft claims across the five authorizations/);
  assert.match(source, /row\.centerId === EXPECTED\.centerId && row\.agencyProgramId === EXPECTED\.programId && row\.authorizationId === authorizationId/);
  assert.match(source, /row\.lines\[0\]\.childId === childId/);
  assert.match(source, /canManageBilling\(actor\) && canAccessCenter\(actorScope, EXPECTED\.centerId\)/);
  assert.match(source, /subsidyClaim\.updateMany/);
  assert.match(source, /subsidyClaimLine\.updateMany/);
});
