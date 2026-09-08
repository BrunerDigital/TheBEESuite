import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  inquirySubmissionIdempotencyKey,
  inquiryTurnstileIdempotencyKey,
} from "@/lib/inquiry-idempotency";

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

test("Turnstile retries use a stable UUID idempotency key", () => {
  const key = inquiryTurnstileIdempotencyKey(base, "turnstile-token");
  assert.equal(key, inquiryTurnstileIdempotencyKey({ ...base, email: " parent@example.com " }, "turnstile-token"));
  assert.notEqual(key, inquiryTurnstileIdempotencyKey(base, "fresh-turnstile-token"));
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("the intake route claims each external delivery once and keeps unfinished work retryable", async () => {
  const source = await readFile("src/app/api/inquiries/route.ts", "utf8");
  assert.match(source, /centerId_externalId/);
  assert.match(source, /createdAt:\s*\{ lt: cutoff \}/);
  assert.match(source, /superseded:/);
  assert.match(source, /duplicateSuppressed:\s*true/);
  assert.match(source, /idempotency_key: idempotencyKey/);
  assert.match(source, /integrationDelivery\.createMany/);
  assert.match(source, /claimIntegrationDeliveryForRetry/);
  assert.match(source, /inquiry:\$\{lead\.id\}:sendgrid/);
});
