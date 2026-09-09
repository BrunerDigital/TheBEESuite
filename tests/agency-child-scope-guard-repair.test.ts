import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prismaMigrationName = "20260908200500_agency_child_scope_guard_repair";
const supabaseMigrationName = "20260909180912_agency_child_scope_guard_repair";
const prismaMigration = readFileSync(`prisma/migrations/${prismaMigrationName}/migration.sql`, "utf8");
const supabaseMigration = readFileSync(`supabase/migrations/${supabaseMigrationName}.sql`, "utf8");

test("deployed child agency parent-scope guard repair stays mirrored and forward-only", () => {
  assert.equal(supabaseMigration, prismaMigration);
  assert.match(prismaMigration, /CREATE OR REPLACE FUNCTION public\.protect_agency_child_parent_scope\(\)/);
  assert.doesNotMatch(prismaMigration, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\."/);
  assert.doesNotMatch(prismaMigration, /DROP (?:TABLE|COLUMN|FUNCTION)/);
  assert.match(
    prismaMigration,
    /REVOKE ALL ON FUNCTION public\.protect_agency_child_parent_scope\(\) FROM PUBLIC, anon, authenticated/,
  );
});

test("every child-scope UNION arm exposes the canonical center_id column", () => {
  const scopeQuery = prismaMigration.slice(
    prismaMigration.indexOf("FROM ("),
    prismaMigration.indexOf(") scope"),
  );
  assert.equal(scopeQuery.match(/AS center_id/g)?.length, 4);
  assert.match(scopeQuery, /SELECT family\."centerId" AS center_id/);
  assert.match(scopeQuery, /SELECT classroom\."centerId" AS center_id/);
  assert.match(scopeQuery, /SELECT subsidy_authorization\."centerId" AS center_id/);
  assert.match(scopeQuery, /SELECT claim\."centerId" AS center_id/);
  assert.match(prismaMigration, /scope\.center_id IS NOT NULL/);
  assert.doesNotMatch(scopeQuery, /SELECT (?:family|classroom|subsidy_authorization|claim)\."centerId"\s+(?:FROM|\r?\n)/);
});

test("repair preserves the fail-closed school and agency history checks", () => {
  assert.match(prismaMigration, /NEW\."familyId" IS NOT DISTINCT FROM OLD\."familyId"/);
  assert.match(prismaMigration, /NEW\."classroomId" IS NOT DISTINCT FROM OLD\."classroomId"/);
  assert.match(prismaMigration, /lock_agency_financial_centers\(affected_center_ids\)/);
  assert.match(prismaMigration, /subsidy_authorization\."familyId" IS DISTINCT FROM NEW\."familyId"/);
  assert.match(prismaMigration, /subsidy_authorization\."centerId" IS DISTINCT FROM family_center_id/);
  assert.match(prismaMigration, /claim\."centerId" IS DISTINCT FROM classroom_center_id/);
  assert.match(prismaMigration, /A child update conflicts with agency authorization or claim history/);
});
