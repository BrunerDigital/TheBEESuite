import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryReadinessSchools } from "../src/lib/school-readiness-inventory";
import { printRolloutGaps } from "../scripts/pilot-readiness-check";

test("readiness includes active schools with missing or unusual CRM identifiers", () => {
  const centers = [
    { id: "cuzco", name: "Cuzco", status: "active", crmLocationId: "Cuzco", locationId: "mhlc-cuzco" },
    { id: "missing", name: "Existing School", status: "active", crmLocationId: null, locationId: null },
    { id: "retired-listing", name: "Cordera", status: "active", crmLocationId: "Kid City USA - CO | Colorado Springs - Cordera", locationId: null },
    { id: "queue", name: "Kid City USA UNASSIGNED Lead Queue", status: "active", crmLocationId: null, locationId: null },
    { id: "closed", name: "Closed School", status: "closed", crmLocationId: "Kid City USA - FL | Closed", locationId: null },
  ];
  const result = inventoryReadinessSchools(centers);
  assert.deepEqual(result.included.map(item => item.id), ["cuzco", "missing", "retired-listing"]);
  assert.equal(result.included.length + result.excluded.length, centers.length);
  assert.match(result.excluded[0].reason, /lead queue/);
  assert.match(result.excluded[1].reason, /not active/);
});

test("an empty school result prints not evaluated and never an all-school pass", () => {
  const lines: string[] = [];
  const original = console.log;
  try { console.log = (...args) => lines.push(args.join(" ")); printRolloutGaps([], true); }
  finally { console.log = original; }
  assert.ok(lines.some(line => line.includes("NOT EVALUATED")));
  assert.ok(!lines.some(line => line.includes("PASS:")));
});
