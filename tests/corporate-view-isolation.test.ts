import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NO_VISIBLE_CENTER_ID,
  requestedVisibleCenterIds,
  visibleAttendanceWhere,
  visibleBillingAccountWhere,
  visibleChildWhere,
  visibleEnrollmentWhere,
  visibleFormSubmissionWhere,
  visibleInvoiceWhere,
  visiblePaymentWhere,
} from "../src/lib/corporate-view-scope";
import { buildVisibleMessageWhere } from "../src/lib/message-visibility";

const tenantACenters = ["tenant-a-center-1", "tenant-a-center-2"];
const tenantBCenter = "tenant-b-center-1";

test("tenant-wide corporate query scopes retain all authorized tenant centers and exclude another tenant", () => {
  const childWhere = visibleChildWhere(tenantACenters);
  const expectedCenterFilter = { in: tenantACenters };

  assert.deepEqual(childWhere, {
    OR: [
      { classroom: { is: { centerId: expectedCenterFilter } } },
      { family: { is: { centerId: expectedCenterFilter } } },
    ],
  });
  assert.equal(JSON.stringify(childWhere).includes(tenantBCenter), false);
  assert.deepEqual(visibleEnrollmentWhere(tenantACenters), {
    child: { is: { family: { is: { centerId: expectedCenterFilter } } } },
  });
  assert.deepEqual(visibleBillingAccountWhere(tenantACenters), {
    family: { is: { centerId: expectedCenterFilter } },
  });
  assert.deepEqual(visibleInvoiceWhere(tenantACenters), {
    billingAccount: { is: { family: { is: { centerId: expectedCenterFilter } } } },
  });
  assert.deepEqual(visiblePaymentWhere(tenantACenters), {
    billingAccount: { is: { family: { is: { centerId: expectedCenterFilter } } } },
  });
  assert.deepEqual(visibleAttendanceWhere(tenantACenters), {
    classroom: { is: { centerId: expectedCenterFilter } },
  });
});

test("limited grants narrow every corporate scope to the granted center", () => {
  const limitedCenters = [tenantACenters[1]];
  const serializedScopes = [
    visibleChildWhere(limitedCenters),
    visibleEnrollmentWhere(limitedCenters),
    visibleInvoiceWhere(limitedCenters),
    visiblePaymentWhere(limitedCenters),
    visibleAttendanceWhere(limitedCenters),
    visibleFormSubmissionWhere(limitedCenters),
  ].map((scope) => JSON.stringify(scope));

  for (const scope of serializedScopes) {
    assert.equal(scope.includes(tenantACenters[1]), true);
    assert.equal(scope.includes(tenantACenters[0]), false);
    assert.equal(scope.includes(tenantBCenter), false);
  }
});

test("empty grants and stale requested center filters fail closed", () => {
  const emptyScope = JSON.stringify(visibleFormSubmissionWhere([]));
  assert.equal(emptyScope.includes(NO_VISIBLE_CENTER_ID), true);
  assert.deepEqual(requestedVisibleCenterIds([], "all"), []);
  assert.deepEqual(requestedVisibleCenterIds(tenantACenters, tenantBCenter), []);
  assert.deepEqual(requestedVisibleCenterIds(tenantACenters, "stale-deleted-center"), []);
  assert.deepEqual(requestedVisibleCenterIds(tenantACenters, tenantACenters[0]), [tenantACenters[0]]);
  assert.deepEqual(requestedVisibleCenterIds(tenantACenters, "all"), tenantACenters);
});

test("corporate messages keep family threads center-scoped and internal threads tenant-scoped", () => {
  const where = buildVisibleMessageWhere({
    userId: "corporate-user-a",
    tenantId: "tenant-a",
    familyScopeWhere: { centerId: { in: tenantACenters } },
    allCenters: true,
    teacherMessageScope: false,
  });
  const serialized = JSON.stringify(where);

  assert.equal(serialized.includes("tenant-a-center-1"), true);
  assert.equal(serialized.includes("tenant-a-center-2"), true);
  assert.equal(serialized.includes("tenant-a"), true);
  assert.equal(serialized.includes(tenantBCenter), false);
  assert.equal(serialized.includes('"familyId":{"not":null}'), false);
});
