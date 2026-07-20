import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prismaMigration = new URL(
  "../prisma/migrations/20260720150000_complete_public_table_rls/migration.sql",
  import.meta.url,
);
const supabaseMigration = new URL(
  "../supabase/migrations/20260720150000_complete_public_table_rls.sql",
  import.meta.url,
);

const protectedTables = [
  "CalendarEvent",
  "ComplianceTask",
  "EmergencyDrillLog",
  "PaymentMethodRequestLink",
  "SurveyResponse",
];

test("public-table RLS migration stays synchronized and closes every audited gap", async () => {
  const [prismaSql, supabaseSql] = await Promise.all([
    readFile(prismaMigration, "utf8"),
    readFile(supabaseMigration, "utf8"),
  ]);

  assert.equal(supabaseSql, prismaSql);
  assert.match(prismaSql, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);
  assert.match(prismaSql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(prismaSql, /FOR ALL TO service_role USING \(true\) WITH CHECK \(true\)/);

  for (const table of protectedTables) {
    assert.match(prismaSql, new RegExp(`'${table}'`));
  }
});
