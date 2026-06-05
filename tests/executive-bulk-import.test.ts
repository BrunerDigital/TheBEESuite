import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExecutiveBulkImportCsv, summarizeExecutiveBulkImport } from "@/lib/executive-bulk-import";

test("executive bulk import parses location and user rows", () => {
  const rows = parseExecutiveBulkImportCsv(`type,name,email,role,locationId,capacity
location,,school@example.com,,fl | Sarasota,120
user,Jane Director,jane@example.com,CENTER_DIRECTOR,FL | Sarasota,`);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, "location");
  assert.equal(rows[0].name, "Kid City USA - Sarasota");
  assert.equal(rows[0].crmLocationId, "FL | Sarasota");
  assert.equal(rows[1].type, "user");
  assert.equal(rows[1].accessScopeType, "CENTER");
  assert.equal(summarizeExecutiveBulkImport(rows).errors, 0);
});

test("executive bulk import reports missing required values", () => {
  const rows = parseExecutiveBulkImportCsv(`type,name,email,locationId
location,Missing Format,,Kid City USA Sarasota
user,,director@example.com,`);

  assert.deepEqual(rows.map((row) => row.errors.length), [1, 2]);
  assert.equal(summarizeExecutiveBulkImport(rows).errors, 3);
});
