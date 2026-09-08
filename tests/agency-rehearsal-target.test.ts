import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AGENCY_PRODUCTION_PROJECT_REF,
  AGENCY_REHEARSAL_PROJECT_REF,
  assertAuthorizedRehearsalDatabaseTarget,
  assertExactSupabaseDatabaseTarget,
} from "../scripts/agency-ledger-rehearsal-target";

const rehearsalPooler =
  `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const productionPooler =
  `postgresql://postgres.${AGENCY_PRODUCTION_PROJECT_REF}:secret@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;

test("rehearsal target validation accepts only the exact branch identity", () => {
  assert.doesNotThrow(() => assertAuthorizedRehearsalDatabaseTarget(rehearsalPooler));
  assert.doesNotThrow(() => assertAuthorizedRehearsalDatabaseTarget(
    `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`,
  ));
  assert.doesNotThrow(() => assertAuthorizedRehearsalDatabaseTarget(
    `postgresql://postgres:secret@db.${AGENCY_REHEARSAL_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
  ));
  assert.throws(() => assertAuthorizedRehearsalDatabaseTarget(productionPooler), /production project/);
  assert.throws(
    () => assertAuthorizedRehearsalDatabaseTarget(
      `postgresql://postgres.${AGENCY_PRODUCTION_PROJECT_REF}:${AGENCY_REHEARSAL_PROJECT_REF}@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require&claim=${AGENCY_REHEARSAL_PROJECT_REF}`,
    ),
    /production project/,
  );
});

test("database target validation rejects lookalikes and unsafe transport", () => {
  const invalidTargets = [
    `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@attacker.invalid:5432/postgres?sslmode=require`,
    `postgresql://postgres.wrongref:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require&ref=${AGENCY_REHEARSAL_PROJECT_REF}`,
    `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/other?sslmode=require`,
    `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${AGENCY_REHEARSAL_PROJECT_REF}:secret@aws-0-us-west-1.pooler.supabase.com:6432/postgres?sslmode=require`,
  ];
  for (const url of invalidTargets) {
    assert.throws(() => assertAuthorizedRehearsalDatabaseTarget(url), /exact expected Supabase project/);
  }
});

test("production source validation requires the exact production project", () => {
  assert.doesNotThrow(() => assertExactSupabaseDatabaseTarget(
    productionPooler,
    AGENCY_PRODUCTION_PROJECT_REF,
    "Production source URL",
  ));
  assert.doesNotThrow(() => assertExactSupabaseDatabaseTarget(
    `postgresql://postgres.${AGENCY_PRODUCTION_PROJECT_REF}:secret@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`,
    AGENCY_PRODUCTION_PROJECT_REF,
    "Production source URL",
  ));
  assert.throws(
    () => assertExactSupabaseDatabaseTarget(rehearsalPooler, AGENCY_PRODUCTION_PROJECT_REF, "Production source URL"),
    /exact expected Supabase project/,
  );
});

test("production-derived seeding is read-only at source and marker-gated before target writes", () => {
  const source = readFileSync("scripts/seed-agency-ledger-rehearsal.ts", "utf8");
  const sourceReadOnly = source.indexOf('await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")');
  const firstSourceRead = source.indexOf("const programs = await tx.$queryRaw");
  const markerCheck = source.indexOf("targetIdentity.databaseMarker !== AGENCY_REHEARSAL_DATABASE_MARKER");
  const firstTargetWrite = source.indexOf('INSERT INTO "Tenant"');
  assert.ok(sourceReadOnly >= 0 && sourceReadOnly < firstSourceRead, "production must become read-only before source reads");
  assert.ok(markerCheck >= 0 && markerCheck < firstTargetWrite, "the database-side branch marker must be checked before target writes");
});
