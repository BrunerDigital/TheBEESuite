import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTeacherLoginEmail,
  generateTeacherLoginCredentials,
  getDefaultTeacherInitialPassword,
  getTeacherLoginDomain,
  normalizeTeacherLoginNamePart,
} from "@/lib/teacher-login";

test("teacher login generator normalizes names into Bee Suite usernames", async () => {
  assert.equal(buildTeacherLoginEmail({ fullName: "Sarah Johnson" }), "sarah.johnson@thebeesuite.io");
  assert.equal(buildTeacherLoginEmail({ fullName: "Mary Jane Smith" }), "maryjane.smith@thebeesuite.io");
  assert.equal(buildTeacherLoginEmail({ fullName: "Anne-Marie O'Neil" }), "annemarie.oneil@thebeesuite.io");
  assert.equal(buildTeacherLoginEmail({ fullName: "Jose\u0301 Garci\u0301a" }), "jose.garcia@thebeesuite.io");
});

test("teacher login generator appends numeric suffixes for collisions", async () => {
  const existing = new Set([
    "sarah.johnson@thebeesuite.io",
    "sarah.johnson2@thebeesuite.io",
  ]);
  const credentials = await generateTeacherLoginCredentials({
    fullName: "Sarah Johnson",
    emailExists: (email) => existing.has(email),
  });

  assert.deepEqual(credentials, {
    email: "sarah.johnson3@thebeesuite.io",
    temporary_password: getDefaultTeacherInitialPassword(),
  });
});

test("teacher login config supports env overrides", () => {
  assert.equal(getTeacherLoginDomain({ TEACHER_LOGIN_DOMAIN: "@school.example" }), "school.example");
  assert.equal(getDefaultTeacherInitialPassword({ DEFAULT_TEACHER_INITIAL_PASSWORD: "Temporary123" }), "Temporary123");
  assert.equal(buildTeacherLoginEmail({ fullName: "Avery Johnson", domain: "school.example" }), "avery.johnson@school.example");
  assert.equal(normalizeTeacherLoginNamePart("  Anne-Marie O'Neil  "), "annemarieoneil");
});
