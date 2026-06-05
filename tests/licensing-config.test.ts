import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeLicensingConfiguration,
  readCenterLicensingConfiguration,
} from "../src/lib/licensing-config";

test("licensing configuration normalizes state-specific director input", () => {
  const config = normalizeLicensingConfiguration({
    state: "FL",
    licensingAgency: "Department of Children and Families",
    licenseNumber: "C12AB3456",
    licenseType: "Child care center",
    licensedCapacity: "94",
    renewalDueDate: "2026-09-30T10:00:00-04:00",
    inspectionDueDate: "2026-07-15",
    ratioRules: "Infants 1:4\nToddlers 1:6",
    childDocumentRules: "Immunization record; physical form",
    staffCredentialRules: "Background check\nCPR / First Aid",
    emergencyPreparednessRules: "Monthly fire drill",
    medicationRules: "Medication authorization required",
  });

  assert.equal(config.status, "ready_for_review");
  assert.equal(config.licensedCapacity, 94);
  assert.equal(config.renewalDueDate, "2026-09-30");
  assert.deepEqual(config.ratioRules.items, ["Infants 1:4", "Toddlers 1:6"]);
  assert.deepEqual(config.childDocumentRules.items, ["Immunization record", "physical form"]);
  assert.deepEqual(config.missingFields, []);
});

test("center licensing configuration falls back to existing center metadata and flags missing rules", () => {
  const config = readCenterLicensingConfiguration(
    {
      licensingConfiguration: {
        state: "",
        licensingAgency: "DCF",
        licenseNumber: "C-123",
        licenseType: "Center",
        ratioRules: { value: "Infants 1:4" },
      },
    },
    { centerState: "FL", licensedCapacity: 72 },
  );

  assert.equal(config.state, "FL");
  assert.equal(config.licensedCapacity, 72);
  assert.equal(config.ratioRules.value, "Infants 1:4");
  assert.equal(config.status, "needs_director_input");
  assert.ok(config.missingFields.includes("renewalDueDate"));
  assert.ok(config.missingFields.includes("childDocumentRules"));
});
