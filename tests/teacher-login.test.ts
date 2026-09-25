import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildTeacherLoginEmail,
  generateTeacherLoginCredentials,
  generateTeacherInitialPassword,
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

test("teacher login generator appends numeric suffixes and creates a strong temporary password", async () => {
  const existing = new Set([
    "sarah.johnson@thebeesuite.io",
    "sarah.johnson2@thebeesuite.io",
  ]);
  const credentials = await generateTeacherLoginCredentials({
    fullName: "Sarah Johnson",
    emailExists: (email) => existing.has(email),
  });

  assert.equal(credentials.email, "sarah.johnson3@thebeesuite.io");
  assert.equal(credentials.temporary_password.length, 32);
  assert.match(credentials.temporary_password, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(credentials.temporary_password, "BusyBees");
});

test("teacher login config supports env overrides", () => {
  assert.equal(getTeacherLoginDomain({ TEACHER_LOGIN_DOMAIN: "@school.example" }), "school.example");
  assert.equal(getDefaultTeacherInitialPassword({ DEFAULT_TEACHER_INITIAL_PASSWORD: "ApprovedTemp123!" }), "ApprovedTemp123!");
  assert.equal(getDefaultTeacherInitialPassword({}).length, "BusyBees".length);
  assert.equal(generateTeacherInitialPassword().length, 32);
  assert.equal(buildTeacherLoginEmail({ fullName: "Avery Johnson", domain: "school.example" }), "avery.johnson@school.example");
  assert.equal(normalizeTeacherLoginNamePart("  Anne-Marie O'Neil  "), "annemarieoneil");
});
