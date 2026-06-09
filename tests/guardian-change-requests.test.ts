import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatGuardianChangeRequestBody,
  normalizeGuardianChangeRequestStatus,
  parseGuardianChangeRequestNote,
} from "@/lib/guardian-change-requests";

test("guardian change request notes parse pending requests", () => {
  const parsed = parseGuardianChangeRequestNote("Emergency contact / authorized pickup update request: Add Grandma Jane, 555-1212");

  assert.deepEqual(parsed, {
    requestType: "Emergency contact / authorized pickup update",
    details: "Add Grandma Jane, 555-1212",
    status: "pending",
  });
});

test("guardian change request notes preserve approved and rejected review status", () => {
  assert.equal(parseGuardianChangeRequestNote("[approved] Contact update request: New phone")?.status, "approved");
  assert.equal(parseGuardianChangeRequestNote("[rejected] Pickup update request: Remove contact")?.status, "rejected");
  assert.equal(normalizeGuardianChangeRequestStatus("anything else"), "pending");
});

test("guardian change request parser keeps review notes out of request details", () => {
  const parsed = parseGuardianChangeRequestNote("[approved] Contact update request: New phone\nReview note: verified by director");

  assert.equal(parsed?.details, "New phone");
});

test("guardian change request formatter emits reviewed note body", () => {
  assert.equal(
    formatGuardianChangeRequestBody({
      requestType: "Contact update",
      details: "Use parent@example.com",
      status: "approved",
    }),
    "[approved] Contact update request: Use parent@example.com",
  );
});
