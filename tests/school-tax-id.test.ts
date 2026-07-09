import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidEinInput, normalizeEin, readSchoolEin, schoolEinCustomFields } from "../src/lib/school-tax-id";

test("school EIN values normalize to receipt format", () => {
  assert.equal(normalizeEin("123456789"), "12-3456789");
  assert.equal(normalizeEin("12-3456789"), "12-3456789");
  assert.equal(normalizeEin(""), null);
  assert.equal(normalizeEin("123"), null);
});

test("school EIN validation allows blank values and requires 9 digits when present", () => {
  assert.equal(isValidEinInput(""), true);
  assert.equal(isValidEinInput("12-3456789"), true);
  assert.equal(isValidEinInput("12-345"), false);
});

test("school EIN custom fields save and clear receipt metadata", () => {
  const saved = schoolEinCustomFields({ existing: true, federalTaxId: "99-9999999" }, "123456789", {
    savedAt: "2026-07-09T12:00:00.000Z",
    savedByEmail: "director@example.com",
    savedByUserId: "user_1",
  });

  assert.equal(saved.existing, true);
  assert.equal(saved.schoolEin, "12-3456789");
  assert.equal(readSchoolEin(saved), "12-3456789");

  const cleared = schoolEinCustomFields(saved, "", {
    savedAt: "2026-07-09T12:05:00.000Z",
  });

  assert.equal(readSchoolEin(cleared), null);
  assert.equal(Object.hasOwn(cleared, "schoolEin"), false);
  assert.equal(Object.hasOwn(cleared, "federalTaxId"), false);
});
