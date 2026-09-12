import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSchoolBusinessProfilePreparationReceipt,
  missingSchoolBusinessProfileFields,
  normalizeSchoolBusinessProfile,
  readSchoolBusinessProfileConfirmation,
  schoolBusinessProfileRevision,
} from "../src/lib/school-business-profile";

const completeProfile = {
  name: "Kid City USA - Example",
  address: "100 Main Street",
  city: "Example",
  state: "fl",
  postalCode: "32000",
  phone: "(555) 555-0100",
  email: "DIRECTOR@EXAMPLE.COM",
  timezone: "America/New_York",
  licensedCapacity: "125",
};

test("school business profiles normalize into one deterministic revision", () => {
  const normalized = normalizeSchoolBusinessProfile(completeProfile);
  assert.equal(normalized.state, "FL");
  assert.equal(normalized.email, "director@example.com");
  assert.equal(normalized.licensedCapacity, 125);
  assert.deepEqual(missingSchoolBusinessProfileFields(normalized), []);
  assert.equal(schoolBusinessProfileRevision(normalized), schoolBusinessProfileRevision({
    ...completeProfile,
    state: "FL",
    email: "director@example.com",
    licensedCapacity: 125,
  }));
});

test("an explicit profile confirmation is current only for the exact saved revision", () => {
  const savedAt = "2026-09-12T03:00:00.000Z";
  const receipt = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: { status: "awaiting_school_confirmation" },
    previousProfile: completeProfile,
    nextProfile: completeProfile,
    confirm: true,
    savedAt,
    savedByEmail: "owner@example.com",
    savedByUserId: "user_1",
    savedByRole: "PLATFORM_OWNER",
  });
  const confirmed = readSchoolBusinessProfileConfirmation({ setupPreparationReceipt: receipt }, completeProfile);

  assert.equal(receipt.version, 2);
  assert.equal(receipt.status, "school_confirmed");
  assert.equal(receipt.confirmedAt, savedAt);
  assert.equal(confirmed.confirmationCurrent, true);
  assert.equal(confirmed.legacyConfirmation, false);

  const editedProfile = { ...completeProfile, phone: "(555) 555-0199" };
  const staleReceipt = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: receipt,
    previousProfile: completeProfile,
    nextProfile: editedProfile,
    confirm: false,
    savedAt: "2026-09-12T04:00:00.000Z",
    savedByEmail: "director@example.com",
  });
  const stale = readSchoolBusinessProfileConfirmation({ setupPreparationReceipt: staleReceipt }, editedProfile);

  assert.equal(staleReceipt.status, "awaiting_school_confirmation");
  assert.equal(staleReceipt.confirmedAt, savedAt, "the prior confirmation remains recoverable history");
  assert.equal(stale.confirmationCurrent, false);
  assert.notEqual(stale.revision, confirmed.revision);
});

test("an unchanged confirmed profile stays confirmed during unrelated setup saves", () => {
  const confirmedReceipt = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: {},
    previousProfile: completeProfile,
    nextProfile: completeProfile,
    confirm: true,
    savedAt: "2026-09-12T03:00:00.000Z",
  });
  const preservedReceipt = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: confirmedReceipt,
    previousProfile: completeProfile,
    nextProfile: completeProfile,
    confirm: false,
    savedAt: "2026-09-12T05:00:00.000Z",
  });

  assert.equal(preservedReceipt.status, "school_confirmed");
  assert.equal(preservedReceipt.confirmedAt, confirmedReceipt.confirmedAt);
  assert.equal(
    readSchoolBusinessProfileConfirmation({ setupPreparationReceipt: preservedReceipt }, completeProfile).confirmationCurrent,
    true,
  );
});

test("legacy confirmations are preserved when unchanged and invalidated when edited", () => {
  const legacyReceipt = {
    status: "school_confirmed",
    confirmedAt: "2026-01-01T00:00:00.000Z",
    confirmedByEmail: "director@example.com",
  };
  assert.equal(
    readSchoolBusinessProfileConfirmation({ setupPreparationReceipt: legacyReceipt }, completeProfile).confirmationCurrent,
    true,
  );

  const upgraded = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: legacyReceipt,
    previousProfile: completeProfile,
    nextProfile: completeProfile,
    confirm: false,
    savedAt: "2026-09-12T05:00:00.000Z",
  });
  assert.equal(upgraded.status, "school_confirmed");
  assert.equal(upgraded.confirmedBusinessProfileRevision, schoolBusinessProfileRevision(completeProfile));

  const edited = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: legacyReceipt,
    previousProfile: completeProfile,
    nextProfile: { ...completeProfile, city: "Changed City" },
    confirm: false,
    savedAt: "2026-09-12T05:00:00.000Z",
  });
  assert.equal(edited.status, "awaiting_school_confirmation");
});

test("incomplete profiles cannot become confirmed receipts", () => {
  const incomplete = { ...completeProfile, licensedCapacity: "0", phone: "" };
  const receipt = buildSchoolBusinessProfilePreparationReceipt({
    existingReceipt: {},
    previousProfile: incomplete,
    nextProfile: incomplete,
    confirm: true,
    savedAt: "2026-09-12T03:00:00.000Z",
  });
  const status = readSchoolBusinessProfileConfirmation({ setupPreparationReceipt: receipt }, incomplete);

  assert.deepEqual(status.missingFields, ["phone", "licensedCapacity"]);
  assert.equal(status.confirmationCurrent, false);
  assert.equal(receipt.status, "awaiting_school_confirmation");
});
