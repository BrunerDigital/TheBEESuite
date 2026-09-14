import assert from "node:assert/strict";
import { test } from "node:test";
import { buildModuleGates, buildReport, readinessExitCode, type CenterRolloutGap, isArchivedCenterlessFamily, isConfirmedIntentionalEmptySchoolStart, needsCurrentClassroomAssignment, parsePilotReadinessArgs, readinessStatus, selectSchoolIds } from "../scripts/pilot-readiness-check";

function reportSchool(setupGaps: string[] = []): CenterRolloutGap {
  const moduleGates = buildModuleGates({ setupGaps, guardianCount: 1, guardianEmailCount: 0, guardianPhoneCount: 1, guardianLoginCount: 1, guardianPinCount: 1 });
  return {
    centerId: "synthetic-school", label: "Synthetic School", locationId: "test",
    identity: { address: null, phone: null, email: null, timezone: "America/New_York", organizationId: "test", organizationName: "Test", tenantId: "test", tenantName: "Test", ownerGroupId: null, ownerGroupName: null, taxIdConfigured: true, businessProfileConfirmed: true, schoolDataPath: "start_clean", intentionalEmptyStartConfirmed: false },
    classroomCount: 1, staffCount: 1, staffWithoutClassroomCount: 0, familyCount: 1, childCount: 1, childrenWithoutClassroomCount: 0,
    guardianCount: 1, guardianEmailCount: 0, guardianPhoneCount: 1, guardianLoginCount: 1, guardianPinCount: 1, authorizedPickupCount: 0, directorAccessCount: 1,
    moduleGates, gaps: [...new Set(Object.values(moduleGates).flatMap((gate) => gate.automatedGaps))],
  };
}

function reportInput(rows: CenterRolloutGap[], modules = "setup"): Parameters<typeof buildReport>[0] {
  return { configChecks: [], databaseChecks: [{ status: "pass", label: "Database", detail: "Connected" }], dataChecks: [], rolloutGapRows: rows, childClassroomMismatches: [], args: parsePilotReadinessArgs(["--module", modules]) };
}

test("connected infrastructure cannot make a blocked school ready", () => {
  const report = buildReport(reportInput([reportSchool(["no classrooms"])]));
  assert.equal(report.summary.failures, 0);
  assert.equal(report.summary.status, "blocked");
  assert.equal(report.summary.blockedSchoolCount, 1);
  assert.equal(report.summary.blockedModuleCount, 1);
  assert.equal(readinessExitCode(report, false), 1);
});

test("unselected invitation blockers do not prevent a setup-only data check", () => {
  const school = reportSchool();
  const report = buildReport(reportInput([school]));
  assert.equal(school.moduleGates["parent-invitations"].status, "blocked");
  assert.equal(report.summary.status, "ready");
  assert.equal(report.summary.blockedModuleCount, 0);
  assert.equal(readinessExitCode(report, false), 0);
});

test("a selected blocked school prevents mixed-fleet readiness", () => {
  const report = buildReport(reportInput([reportSchool(), reportSchool(["missing records"])], "setup,billing"));
  assert.equal(report.summary.status, "blocked");
  assert.equal(report.summary.blockedSchoolCount, 1);
  assert.equal(report.summary.blockedModuleCount, 2);
  assert.equal(report.summary.approvalRequiredModuleCount, 1);
});

test("automated billing prerequisites do not count as activation approval", () => {
  const report = buildReport(reportInput([reportSchool()], "billing,kiosk"));
  assert.equal(report.summary.status, "manual_approval_required");
  assert.equal(report.summary.label, "MANUAL APPROVAL REQUIRED");
  assert.equal(report.summary.approvalRequiredModuleCount, 2);
  assert.equal(readinessExitCode(report, false), 1);
});

test("no evaluated schools cannot produce a successful readiness exit", () => {
  const report = buildReport(reportInput([]));
  assert.equal(report.summary.status, "blocked");
  assert.equal(readinessExitCode(report, false), 1);
});

test("infrastructure failures and optional warning strictness remain effective", () => {
  const input = reportInput([reportSchool()]);
  input.configChecks = [{ status: "warn", label: "Optional", detail: "Review" }];
  const warning = buildReport(input);
  assert.equal(warning.summary.status, "ready_with_warnings");
  assert.equal(readinessExitCode(warning, false), 0);
  assert.equal(readinessExitCode(warning, true), 1);
  input.databaseChecks = [{ status: "fail", label: "Database", detail: "Unavailable" }];
  assert.equal(buildReport(input).summary.status, "blocked");
});

test("pilot readiness args enable machine-readable rollout reports", () => {
  assert.deepEqual(parsePilotReadinessArgs([]), {
    all: false,
    json: false,
    failOnWarn: false,
    schools: [],
    modules: ["setup"],
  });

  assert.deepEqual(parsePilotReadinessArgs(["--all", "--json", "--fail-on-warn", "--output", "tmp/readiness.json"]), {
    all: true,
    json: true,
    failOnWarn: true,
    schools: [],
    modules: ["setup"],
    outputPath: "tmp/readiness.json",
  });

  assert.deepEqual(parsePilotReadinessArgs(["--output=tmp/readiness.json"]), {
    all: false,
    json: false,
    failOnWarn: false,
    schools: [],
    modules: ["setup"],
    outputPath: "tmp/readiness.json",
  });
});

test("classroom readiness applies only to currently enrolled children", () => {
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "enrolled", classroomId: null }), true);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "active", classroomId: null }), true);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "waitlisted", classroomId: null }), false);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "withdrawn", classroomId: null }), false);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "enrolled", classroomId: "room-1" }), false);
});

test("a confirmed intentional empty start satisfies setup data presence without activating family workflows", () => {
  const setup = {
    version: 1 as const,
    path: "start_clean" as const,
    sourceSystem: null,
    noCurrentFamiliesExpected: true,
    notes: "",
    selectedAt: "2026-09-12T00:00:00.000Z",
    selectedByUserId: "user_1",
    selectedByEmail: "director@example.com",
    reviewConfirmation: {
      revision: "revision_1",
      path: "start_clean" as const,
      sourceSystem: null,
      noCurrentFamiliesExpected: true,
      confirmedAt: "2026-09-12T00:01:00.000Z",
      confirmedByUserId: "user_1",
      confirmedByEmail: "director@example.com",
      latestImportBatchId: null,
      familyCount: 0,
      childCount: 0,
      guardianCount: 0,
    },
  };

  assert.equal(isConfirmedIntentionalEmptySchoolStart({ setup, familyCount: 0, childCount: 0, guardianCount: 0 }), true);
  assert.equal(isConfirmedIntentionalEmptySchoolStart({ setup, familyCount: 1, childCount: 0, guardianCount: 0 }), false);
  assert.equal(isConfirmedIntentionalEmptySchoolStart({
    setup: { ...setup, reviewConfirmation: null },
    familyCount: 0,
    childCount: 0,
    guardianCount: 0,
  }), false);
});

test("centerless archived and merged families preserve history without blocking readiness", () => {
  const inactive = { children: [], billingAccount: null };
  assert.equal(isArchivedCenterlessFamily({ externalId: "merged:123", customFields: null, ...inactive }), true);
  assert.equal(isArchivedCenterlessFamily({ externalId: "ARCHIVED:456", customFields: null, ...inactive }), true);
  assert.equal(isArchivedCenterlessFamily({ externalId: "123", customFields: { mergedIntoFamilyId: "family-2" }, ...inactive }), true);
  assert.equal(isArchivedCenterlessFamily({ externalId: null, customFields: { archivedReason: "duplicate" }, ...inactive }), true);
  assert.equal(isArchivedCenterlessFamily({ externalId: "123", customFields: {}, ...inactive }), false);
  assert.equal(isArchivedCenterlessFamily({ externalId: null, customFields: null, ...inactive }), false);
  assert.equal(isArchivedCenterlessFamily({
    externalId: "merged:123",
    customFields: null,
    children: [{ enrollmentStatus: "enrolled" }],
    billingAccount: null,
  }), false);
  for (const enrollmentStatus of ["current", "pending", "summer_break", "unexpected_status"]) {
    assert.equal(isArchivedCenterlessFamily({
      externalId: "merged:123",
      customFields: null,
      children: [{ enrollmentStatus }],
      billingAccount: null,
    }), false);
  }
  assert.equal(isArchivedCenterlessFamily({
    externalId: "merged:123",
    customFields: null,
    children: [{ enrollmentStatus: "withdrawn" }],
    billingAccount: null,
  }), true);
  assert.equal(isArchivedCenterlessFamily({
    externalId: "archived:123",
    customFields: null,
    children: [],
    billingAccount: { balanceCents: 100, invoices: [] },
  }), false);
  assert.equal(isArchivedCenterlessFamily({
    externalId: "archived:123",
    customFields: null,
    children: [],
    billingAccount: { balanceCents: 0, invoices: [{ id: "invoice-1" }] },
  }), false);
});

test("pilot readiness args support exact school selection and separate module gates", () => {
  assert.deepEqual(
    parsePilotReadinessArgs(["--school", "IN | Kokomo", "--school=school-2", "--module", "setup,parent-invitations", "--module=kiosk", "--json"]),
    {
      all: false,
      json: true,
      failOnWarn: false,
      schools: ["IN | Kokomo", "school-2"],
      modules: ["setup", "parent-invitations", "kiosk"],
    },
  );
  assert.throws(() => parsePilotReadinessArgs(["--module", "payments"]), /Unknown rollout module/);
});

test("pilot readiness args reject ambiguous output paths and unknown flags", () => {
  assert.throws(() => parsePilotReadinessArgs(["--output"]), /requires a file path/);
  assert.throws(() => parsePilotReadinessArgs(["--output", "--json"]), /requires a file path/);
  assert.throws(() => parsePilotReadinessArgs(["--quiet"]), /Unknown pilot readiness option/);
});

test("pilot readiness status separates warnings from blockers", () => {
  assert.equal(readinessStatus(0, 0), "ready");
  assert.equal(readinessStatus(0, 2), "ready_with_warnings");
  assert.equal(readinessStatus(1, 0), "blocked");
  assert.equal(readinessStatus(1, 2), "blocked");
});

test("school selectors require an exact unambiguous active-school identifier", () => {
  const centers = [
    { id: "center-1", name: "Kid City USA - Kokomo", locationId: "IN | Kokomo", crmLocationId: "crm-kokomo" },
    { id: "center-2", name: "Kid City USA - Longmont", locationId: "CO | Longmont", crmLocationId: "crm-longmont" },
  ];
  assert.deepEqual(selectSchoolIds(centers, ["in | kokomo", "center-2"]), ["center-1", "center-2"]);
  assert.throws(() => selectSchoolIds(centers, ["Kokomo"]), /not found/);
});

test("module gates keep setup, invitations, kiosk, and billing separately controlled", () => {
  const gates = buildModuleGates({
    setupGaps: [],
    guardianCount: 3,
    guardianEmailCount: 2,
    guardianPhoneCount: 3,
    guardianLoginCount: 0,
    guardianPinCount: 3,
  });
  assert.equal(gates.setup.status, "data_ready");
  assert.equal(gates["parent-invitations"].status, "blocked");
  assert.deepEqual(gates["parent-invitations"].automatedGaps, ["1 guardian(s) need a valid invitation email"]);
  assert.equal(gates.kiosk.status, "manual_approval_required");
  assert.equal(gates.billing.status, "manual_approval_required");
  assert.equal(gates.billing.separateApprovalRequired, true);

  const identityGates = buildModuleGates({
    setupGaps: ["school EIN/tax receipt details are not configured"],
    operationalActivationGaps: [],
    guardianCount: 2,
    guardianEmailCount: 2,
    guardianPhoneCount: 2,
    guardianLoginCount: 2,
    guardianPinCount: 2,
  });
  assert.equal(identityGates.setup.status, "blocked");
  assert.equal(identityGates["parent-invitations"].status, "manual_approval_required");
  assert.equal(identityGates.kiosk.status, "manual_approval_required");
  assert.equal(identityGates.billing.status, "blocked");

  const importGates = buildModuleGates({
    setupGaps: [],
    guardianCount: 2,
    guardianEmailCount: 2,
    guardianPhoneCount: 2,
    guardianLoginCount: 0,
    guardianPinCount: 0,
    invitationImportGaps: ["The linked ProCare import is not complete and error-free."],
  });
  assert.equal(importGates["parent-invitations"].status, "blocked");
  assert.deepEqual(importGates["parent-invitations"].automatedGaps, ["The linked ProCare import is not complete and error-free."]);
});

test("classroom readiness applies only to currently enrolled children", () => {
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "enrolled", classroomId: null }), true);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "active", classroomId: null }), true);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "waitlisted", classroomId: null }), false);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "withdrawn", classroomId: null }), false);
  assert.equal(needsCurrentClassroomAssignment({ enrollmentStatus: "enrolled", classroomId: "room-1" }), false);
});
