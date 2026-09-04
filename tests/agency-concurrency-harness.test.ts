import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const harnessPath = new URL("../scripts/rehearse-agency-ledger-concurrency.mjs", import.meta.url);

test("concurrency harness binds the installed Supabase schema before its first durable write", async () => {
  const harness = await readFile(harnessPath, "utf8");

  assert.match(harness, /version: "20260904230802"/);
  assert.match(harness, /name: "20260903190000_agency_receivable_ledger"/);
  assert.match(harness, /statementCount: 1/);
  assert.match(harness, /statementOctets: 31_631/);
  assert.match(harness, /statementsSha256: "ef3d32acb21cca1e11d08db5098c850bca79b1bea89382a2c60e27454d59c0c5"/);
  assert.match(harness, /version: "20260904230805"/);
  assert.match(harness, /name: "20260903210000_agency_reconciliation_controls"/);
  assert.match(harness, /statementOctets: 253_662/);
  assert.match(harness, /statementsSha256: "5576f0ae9f743e45a713151dd7a87809d3596c33bc75b29b4e9ef4b9f3a99bd8"/);
  assert.match(harness, /supabase_migrations\.schema_migrations/);
  assert.match(harness, /to_regclass\('public\."_prisma_migrations"'\)/);
  assert.match(harness, /assert\.deepEqual\(candidatePrismaRows, \[\]/);
  assert.match(harness, /expected\.statementsSha256,\s*\n\s*expectedMigrationSha256\[expected\.key\]/);
  assert.match(harness, /a8304df5ba2c68761c5b90525784557be3dab250f96c0530da2c0c86705c2793/);
  assert.match(harness, /agencyProgramCount: "82"/);
  assert.match(harness, /activeProgramCount: "5"/);
  assert.match(harness, /setupRequiredProgramCount: "77"/);
  assert.match(harness, /agencyProgramChecksum: "116c4ec14ae661d0225af532090169d6"/);
  assert.match(harness, /subsidyClaimCount: "51"/);
  assert.match(harness, /subsidyClaimChecksum: "81b9fb864f91a530ac84e9ffba4320fb"/);
  assert.match(harness, /billingAccountBalanceCents: "12400"/);
  assert.match(harness, /billingAccountChecksum: "7b0b4e8d7cd60bbbfcd2c0de865dbdb3"/);
  assert.match(harness, /familyLedgerEntryCents: "-122470"/);
  assert.match(harness, /familyLedgerChecksum: "a3b75d5417d644cd8a6f5115857d175b"/);
  assert.match(harness, /legacyAgencyPaymentChecksum: "b22b65d0feb18b5819c2860da9ffdbeb"/);
  assert.match(harness, /ledgerAccountCount: "82"/);
  assert.match(harness, /nonzeroLedgerAccountCount: "0"/);
  assert.match(harness, /ledgerEntryCount: "0"/);
  assert.match(harness, /everySanitizedCenterCarriesSourceShapeMarker/);

  const seedStart = harness.indexOf("async function seedCommittedFixture()");
  const seedEnd = harness.indexOf("async function activationVersusBaselineRemittance()", seedStart);
  const seed = harness.slice(seedStart, seedEnd);
  assert.ok(seedStart >= 0 && seedEnd > seedStart);
  assert.ok(seed.indexOf("verifyTargetInsideTransaction(tx)") < seed.indexOf("readInstalledMigrationWriterEvidence(tx)"));
  assert.ok(seed.indexOf("readInstalledMigrationWriterEvidence(tx)") < seed.indexOf("readExpectedProductionDerivedSeedEvidence(tx)"));
  assert.ok(seed.indexOf("readExpectedProductionDerivedSeedEvidence(tx)") < seed.indexOf("tx.tenant.create"));
  assert.doesNotMatch(seed, /SET CONSTRAINTS ALL IMMEDIATE/);
  assert.match(seed, /Let COMMIT flush the initially-deferred source guard/);
  assert.ok(
    seed.indexOf('}, { isolationLevel: "Serializable", timeout: 60_000 });')
      < seed.indexOf("const [claim, submittedClaim, accounts, entries] = await Promise.all"),
    "The committed projection must be read only after the setup transaction resolves.",
  );
  assert.match(seed, /agency-ledger-account:\$\{ids\.program\}/);
  assert.match(seed, /agency-ledger-claim:\$\{ids\.claim\}/);
  assert.match(seed, /balanceAfterCents: 10_000/);
  assert.match(seed, /externalId: `claim-approved:\$\{ids\.claim\}`/);
  assert.match(harness, /referenceKey: `ach:RACE-BATCH-\$\{run\.toUpperCase\(\)\}`/);
  assert.match(harness, /assert\.equal\(committedDuplicateFailure\.metaCode, "23505"\)/);
  assert.match(harness, /committedDuplicateFailure\.metaMessage \?\? ""/);
  assert.match(harness, /\$\{ids\.batch\}, \$\{ids\.claim\}/);

  const mainPreflight = harness.indexOf("const preflight = await verifyInstalledMigrationWriter()");
  const durableSeed = harness.indexOf("const committedSeed = await seedCommittedFixture()");
  assert.ok(mainPreflight >= 0 && durableSeed > mainPreflight);
  assert.match(harness, /assert\.deepEqual\(committedSeed\.transactionPreflight, preflight\)/);
  assert.match(harness, /committedSeedProjection: committedSeed\.committedProjection/);
  assert.match(harness, /capturedProductionDerivedSeed: preflight\.capturedSeed/);
});
