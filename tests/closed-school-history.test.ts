import assert from "node:assert/strict";
import test from "node:test";
import { schoolHistoryStatusWhere } from "@/lib/workspace-selection";
import { visiblePaymentWhere, visibleInvoiceWhere, visibleFamilyWhere } from "@/lib/corporate-view-scope";

test("closed school history preserves the role boundary", () => {
  for (const role of ["BRAND_ADMIN", "REGIONAL_MANAGER", "PLATFORM_OWNER", "READ_ONLY_AUDITOR"]) {
    assert.deepEqual(schoolHistoryStatusWhere(role), {});
  }
  for (const role of ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR", "TEACHER", "PARENT_GUARDIAN", "BILLING_ADMIN", "unknown"]) {
    assert.deepEqual(schoolHistoryStatusWhere(role), { status: { not: "closed" } });
  }
});

test("historical family, invoice and payment queries retain exact authorized school scope", () => {
  const family = { centerId: { in: ["garland"] } };
  assert.deepEqual(visibleFamilyWhere(["garland"]), family);
  assert.deepEqual(visibleInvoiceWhere(["garland"]), { billingAccount: { is: { family: { is: family } } } });
  assert.deepEqual(visiblePaymentWhere(["garland"]), { billingAccount: { is: { family: { is: family } } } });
  assert.deepEqual(visiblePaymentWhere([]), {
    billingAccount: { is: { family: { is: { centerId: { in: ["__no_visible_centers__"] } } } } },
  });
});
