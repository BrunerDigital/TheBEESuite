import assert from "node:assert/strict";
import test from "node:test";
import { formSchemaSummary } from "../src/lib/form-schema-summary";

test("summarizes imported field names without exposing schema metadata", () => {
  assert.equal(formSchemaSummary({ fields: ["guardian_signature", "reviewed_at"], demoWorkspace: true, secret: "hidden" }), "2 fields: guardian signature, reviewed at");
});
test("summarizes modern labels, falls back to keys and bounds the preview", () => {
  assert.equal(formSchemaSummary({ fields: [{ label: "Child name" }, { key: "guardian_email" }, { label: "DOB" }, "Consent"] }), "4 fields: Child name, guardian email, DOB, +1 more");
});
test("handles malformed schemas and empty field labels", () => {
  for (const schema of [null, [], "fields", {}, { fields: false }, { fields: [null, false, {}, " ", []] }]) assert.equal(formSchemaSummary(schema), "No fields configured");
});
