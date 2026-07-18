import assert from "node:assert/strict";
import { test } from "node:test";
import { EnrollmentStage, UserRole } from "@prisma/client";
import { getDashboardCenterScopeWhere, getLeadScopeWhere, type CurrentUser } from "@/lib/auth";
import { KID_CITY_USA_BRANDING } from "@/lib/brand-assets";
import { stageNurtureTask } from "@/lib/crm";

test("stage nurture tasks create human follow-up copy for every pipeline stage", () => {
  for (const stage of Object.values(EnrollmentStage)) {
    const task = stageNurtureTask(stage, "Rivera Family");
    assert.equal(typeof task, "string");
    assert.match(task ?? "", /Rivera Family/);
  }
});

test("stage nurture task falls back to family label when name is blank", () => {
  assert.equal(
    stageNurtureTask(EnrollmentStage.NEW_INQUIRY, ""),
    "Call family within 1 business day",
  );
});

test("location CRM lead scope limits dashboard leads to the user's assigned center", () => {
  const user = {
    id: "user_holly_hill",
    tenantId: "tenant_kid_city",
    email: "hollyhill@kidcityusa.com",
    name: "Holly Hill Director",
    role: UserRole.CENTER_DIRECTOR,
    organizationId: "org_kid_city",
    mustResetPassword: false,
    centerIds: ["center_holly_hill"],
    primaryCenterId: "center_holly_hill",
    deviceSessionId: null,
    accessScope: "center",
    accessGrantCount: 1,
    profilePhotoUrl: null,
    branding: KID_CITY_USA_BRANDING,
  } satisfies CurrentUser;

  assert.deepEqual(getLeadScopeWhere(user), { id: { in: ["center_holly_hill"] } });

  assert.deepEqual(
    getDashboardCenterScopeWhere({ ...user, centerIds: ["center_holly_hill", "center_other"] }),
    { id: "center_holly_hill" },
  );
  assert.deepEqual(
    getDashboardCenterScopeWhere({
      ...user,
      role: UserRole.REGIONAL_MANAGER,
      centerIds: ["center_holly_hill", "center_other"],
    }),
    { id: { in: ["center_holly_hill", "center_other"] } },
  );
});
