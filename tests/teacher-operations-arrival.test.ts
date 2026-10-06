import assert from "node:assert/strict";
import test from "node:test";
import { defaultNextPathForLoginPortal, homePathForRole, resolvePortalPostLoginPath, resolvePostLoginPath } from "../src/lib/login-routing";

test("teacher sign-in goes directly to the classroom roster with attendance actions", () => {
  const operations = "/teacher-portal#teacher-roster";
  assert.equal(defaultNextPathForLoginPortal("teachers"), operations);
  assert.equal(homePathForRole("TEACHER"), operations);
  for (const requestedNext of [undefined, "/dashboard", "/teacher-portal", "/school-setup", "//example.test"]) {
    assert.equal(resolvePortalPostLoginPath({ portal: "teachers", role: "TEACHER", requestedNext }), operations);
  }
});

test("operations arrival retains school context and explicit task destinations", () => {
  assert.equal(resolvePostLoginPath({ role: "TEACHER", requestedNext: "/teacher-portal?centerId=fake&keep=1" }), "/teacher-portal?centerId=fake&keep=1#teacher-roster");
  for (const requestedNext of ["/teacher-portal#teacher-home-heading", "/teacher-portal?keep=1#teacher-photo", "/daily-reports", "/family-detail?view=messages"]) {
    // Family detail is outside the existing teacher login allowlist.
    assert.equal(resolvePostLoginPath({ role: "TEACHER", requestedNext }), requestedNext.startsWith("/family-detail") ? "/teacher-portal#teacher-roster" : requestedNext);
  }
  assert.equal(resolvePostLoginPath({ role: "CENTER_DIRECTOR", requestedNext: "/teacher-portal" }), "/classroom-dashboard");
  assert.equal(resolvePostLoginPath({ role: "PARENT_GUARDIAN", requestedNext: "/teacher-portal" }), "/parent-portal");
  assert.equal(defaultNextPathForLoginPortal("parents"), "/parent-portal");
});
