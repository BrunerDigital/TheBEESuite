import assert from "node:assert/strict";
import { test } from "node:test";
import { EnrollmentStage, UserRole } from "@prisma/client";
import { canAccessCenter, getDashboardCenterScopeWhere, getLeadScopeWhere, type CurrentUser } from "@/lib/auth";
import { KID_CITY_USA_BRANDING } from "@/lib/brand-assets";
import { crmPipelineStageDisclosure, crmStageApprovalBoundary, stageNurtureTask } from "@/lib/crm";

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
    assignedClassroomId: null,
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

test("two-school CRM isolation denies each director access to the other school", () => {
  const schoolADirector = { role: UserRole.CENTER_DIRECTOR, centerIds: ["school_a"], accessScope: "center" } as CurrentUser;
  const schoolBDirector = { role: UserRole.CENTER_DIRECTOR, centerIds: ["school_b"], accessScope: "center" } as CurrentUser;

  assert.deepEqual(getLeadScopeWhere(schoolADirector), { id: { in: ["school_a"] } });
  assert.deepEqual(getLeadScopeWhere(schoolBDirector), { id: { in: ["school_b"] } });
  assert.equal(canAccessCenter(schoolADirector, "school_a"), true);
  assert.equal(canAccessCenter(schoolADirector, "school_b"), false);
  assert.equal(canAccessCenter(schoolBDirector, "school_a"), false);
  assert.equal(canAccessCenter(schoolBDirector, "school_b"), true);
});

test("CRM Enrolled stage requires a linked director-approved enrollment record", () => {
  const blocked = crmStageApprovalBoundary(EnrollmentStage.ENROLLED, 0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, "approved_enrollment_required");
  assert.match(blocked.message, /director registration approval/i);

  const allowed = crmStageApprovalBoundary(EnrollmentStage.ENROLLED, 1);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.approvedRecordExists, true);
  assert.match(allowed.disclosure, /do not create or approve/i);
  assert.equal(crmPipelineStageDisclosure, allowed.disclosure);
});
