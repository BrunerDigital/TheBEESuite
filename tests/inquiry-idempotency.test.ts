import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { inquirySubmissionIdempotencyKey } from "@/lib/inquiry-idempotency";

const base = {
  centerId: "center-tyler",
  parentName: "Pat Parent",
  email: "Parent@Example.com",
  phone: "(903) 555-0100",
  program: "Daycare",
};

test("identical inquiries share a stable fingerprint across a retry-window boundary", () => {
  assert.equal(
    inquirySubmissionIdempotencyKey(base),
    inquirySubmissionIdempotencyKey({
      ...base,
      parentName: " pat parent ",
      email: " parent@example.com ",
      phone: "903-555-0100",
    }),
  );
});

test("a material inquiry change creates a new key", () => {
  const original = inquirySubmissionIdempotencyKey(base);
  assert.notEqual(original, inquirySubmissionIdempotencyKey({ ...base, program: "Preschool" }));
  assert.notEqual(original, inquirySubmissionIdempotencyKey({ ...base, parentName: "Another Parent" }));
});

test("the intake route suppresses the duplicate before integrations run", async () => {
  const source = await readFile("src/app/api/inquiries/route.ts", "utf8");
  const suppression = source.indexOf("if (duplicateSuppressed)");
  const integrationDispatch = source.indexOf("await Promise.all([", suppression);
  assert.ok(suppression > -1);
  assert.ok(integrationDispatch > suppression);
  assert.match(source, /centerId_externalId/);
  assert.match(source, /createdAt:\s*\{ lt: cutoff \}/);
  assert.match(source, /superseded:/);
  assert.match(source, /duplicateSuppressed:\s*true/);
});
