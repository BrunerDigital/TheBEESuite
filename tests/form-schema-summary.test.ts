import assert from "node:assert/strict";
import test from "node:test";
import { formSchemaSummary } from "../src/lib/form-schema-summary";
import { kidCityRegistrationPacketSchema } from "../src/lib/registration-packet";

test("summarizes imported field names without exposing schema metadata", () => {
  assert.equal(formSchemaSummary({ fields: ["guardian_signature", "reviewed_at"], demoWorkspace: true, secret: "hidden" }), "2 fields: guardian signature, reviewed at");
});
test("summarizes modern labels, falls back to keys and bounds the preview", () => {
  assert.equal(formSchemaSummary({ fields: [{ label: "Child name" }, { key: "guardian_email" }, { label: "DOB" }, "Consent"] }), "4 fields: Child name, guardian email, DOB, +1 more");
});
test("handles malformed schemas and empty field labels", () => {
  for (const schema of [null, [], "fields", {}, { fields: false }, { fields: [null, false, {}, " ", []] }]) assert.equal(formSchemaSummary(schema), "No fields configured");
});

test("the persisted online registration packet reports its configured section fields", () => {
  assert.equal(formSchemaSummary(kidCityRegistrationPacketSchema()), "152 fields: School, Program / age group, Requested schedule, +149 more");
});
test("combines section and top-level fields while ignoring malformed sections and metadata", () => {
  assert.equal(formSchemaSummary({ fields: ["Consent"], sections: [null, [], { fields: false }, { label: "Metadata only" }, { fields: [{ label: "Child name" }, { key: "guardian_email" }] }] }), "3 fields: Consent, Child name, guardian email");
});
