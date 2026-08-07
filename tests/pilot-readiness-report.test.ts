import assert from "node:assert/strict";
import { test } from "node:test";
import { buildModuleGates, needsCurrentClassroomAssignment, parsePilotReadinessArgs, readinessStatus, selectSchoolIds } from "../scripts/pilot-readiness-check";

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
