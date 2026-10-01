import assert from "node:assert/strict";
import test from "node:test";
import { bulkClaimDate, bulkClaimInput, prepareBulkClaim, type BulkClaimAuthorization } from "../src/lib/agency-bulk-claims";

const authorization: BulkClaimAuthorization = {
  id: "a", centerId: "s", agencyProgramId: "p", childId: "c", familyId: "f", authorizationNumber: "ELC-a", status: "active", updatedAt: new Date("2026-01-01"),
  coverageStart: new Date("2026-01-01"), coverageEnd: new Date("2027-12-31"), authorizedRateCents: 18000, authorizedUnits: 50, unitType: "weekly", requiredDocuments: [],
  center: { timezone: "America/New_York" }, family: { id: "f", centerId: "s" }, child: { id: "c", familyId: "f", fullName: "Child", enrollmentStatus: "enrolled", classroomId: "room" },
  agencyProgram: { id: "p", centerId: "s", status: "active", updatedAt: new Date("2026-01-01"), requirements: [] }, claims: [],
};
const input = bulkClaimInput({ authorizationId: "a", servicePeriodStart: "2026-10-05", servicePeriodEnd: "2026-10-09", serviceUnits: "1" });
test("bulk weekly and daily rows use entered units and each authorized rate without guessing attendance", () => {
  assert.equal(prepareBulkClaim(authorization, input, "s", "p").claimedCents, 18000);
  const daily = prepareBulkClaim({ ...authorization, unitType: "daily", authorizedRateCents: 4000 }, { ...input, serviceUnits: 5, attendanceDays: 5 }, "s", "p");
  assert.equal(daily.claimedCents, 20000); assert.equal(daily.error, "");
  assert.equal(input.attendanceDays, null);
  const zeroAttendance = prepareBulkClaim(authorization, { ...input, attendanceDays: 0 }, "s", "p");
  assert.equal(zeroAttendance.attendanceDays, 0);
});
test("bulk input rejects rolled calendar dates, invalid units, attendance and excessive totals", () => {
  assert.equal(bulkClaimDate("2026-02-30"), null); assert.equal(bulkClaimDate("2026-10-05T00:00:00Z"), null);
  for (const serviceUnits of [0, -1, NaN, Infinity, 1.0000001, 1_000_001]) assert.ok(prepareBulkClaim(authorization, { ...input, serviceUnits }, "s", "p").error);
  for (const attendanceDays of [-1, 1.5, 6, NaN]) assert.ok(prepareBulkClaim(authorization, { ...input, attendanceDays }, "s", "p").error);
  assert.ok(prepareBulkClaim({ ...authorization, authorizedUnits: null, authorizedRateCents: 2_147_483_647 }, { ...input, serviceUnits: 2 }, "s", "p").error);
  const foreignChild = prepareBulkClaim({ ...authorization, child: { ...authorization.child, familyId: "foreign", fullName: "Foreign child" } }, input, "s", "p");
  assert.equal(foreignChild.childName, "Authorization needs review");
  assert.equal(foreignChild.fingerprint, "");
});
test("bulk totals respect prior units and fingerprints invalidate changes to period, units and due date", () => {
  const history = { ...authorization, authorizedUnits: 2, claims: [{ number: "prior", servicePeriodStart: new Date("2026-09-01"), servicePeriodEnd: new Date("2026-09-07"), lines: [{ serviceUnits: 2 }] }] };
  assert.match(prepareBulkClaim(history, input, "s", "p").error, /total approved units/);
  const row = prepareBulkClaim(authorization, input, "s", "p");
  for (const change of [{ serviceUnits: 2 }, { dueDate: "2026-10-31" }, { servicePeriodEnd: "2026-10-10" }, { attendanceDays: 3 }]) {
    assert.notEqual(prepareBulkClaim(authorization, { ...input, ...change }, "s", "p").fingerprint, row.fingerprint);
  }
});
