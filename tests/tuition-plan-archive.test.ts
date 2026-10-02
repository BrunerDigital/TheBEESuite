import assert from "node:assert/strict";
import test from "node:test";
import { archivedTuitionPlanIds, archivedTuitionAssignmentAllowed, tuitionPlanArchiveFields, tuitionPlanIsArchived } from "../src/lib/tuition-plan-archive";

test("archive and restore preserve unrelated school settings and existing historical plan IDs", () => {
  const before = { stripeAccountId: "fixture_account", tuitionBillingEnabled: true, archivedTuitionPlanIds: ["older"] };
  const archived = tuitionPlanArchiveFields(before, "duplicate", true);
  assert.deepEqual(archivedTuitionPlanIds(archived), ["older", "duplicate"]);
  assert.equal(archived.stripeAccountId, "fixture_account");
  assert.equal(archived.tuitionBillingEnabled, true);
  assert.deepEqual(before.archivedTuitionPlanIds, ["older"]);
  assert.deepEqual(tuitionPlanArchiveFields(archived, "duplicate", false), before);
});

test("archiving is idempotent and restoration does not affect another archived rate", () => {
  const once = tuitionPlanArchiveFields({}, "rate", true);
  assert.deepEqual(tuitionPlanArchiveFields(once, "rate", true), once);
  assert.deepEqual(archivedTuitionPlanIds(tuitionPlanArchiveFields(once, "other", false)), ["rate"]);
});

test("archived rates remain available to their saved child assignment but cannot be newly assigned", () => {
  const fields = { archivedTuitionPlanIds: ["historical"] };
  assert.equal(archivedTuitionAssignmentAllowed(fields, "historical", "historical"), true);
  assert.equal(archivedTuitionAssignmentAllowed(fields, "historical", "different"), false);
  assert.equal(archivedTuitionAssignmentAllowed(fields, "historical", null), false);
  assert.equal(archivedTuitionAssignmentAllowed(fields, "active", null), true);
});

test("malformed archive settings do not invent archived records", () => {
  assert.deepEqual(archivedTuitionPlanIds(null), []);
  assert.deepEqual(archivedTuitionPlanIds({ archivedTuitionPlanIds: [null, 5, "", "rate", "rate"] }), ["rate"]);
  assert.equal(tuitionPlanIsArchived({ archivedTuitionPlanIds: "rate" }, "rate"), false);
});
