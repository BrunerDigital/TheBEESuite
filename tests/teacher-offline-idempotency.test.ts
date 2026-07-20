import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");

test("queued teacher mutations have database-enforced idempotency keys", () => {
  assert.match(schema, /model AttendanceRecord[\s\S]*clientActionId\s+String\?\s+@unique/);
  assert.match(schema, /model DailyReport[\s\S]*@@unique\(\[childId, clientActionId\]\)/);
  assert.match(schema, /model IncidentReport[\s\S]*clientActionId\s+String\?\s+@unique/);
  assert.match(schema, /model ChildLocationTransition[\s\S]*clientActionId\s+String\?\s+@unique/);
});

test("queued teacher routes replay existing records instead of duplicating them", () => {
  for (const path of [
    "src/app/api/teacher/attendance/route.ts",
    "src/app/api/teacher/daily-reports/route.ts",
    "src/app/api/teacher/incidents/route.ts",
    "src/app/api/children/location/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /clientActionId/);
    assert.match(source, /replayed:\s*true/);
  }
});
