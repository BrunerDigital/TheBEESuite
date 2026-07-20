import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { redactForOperationalLog } from "../src/lib/request-response-logging";
import {
  evaluateDatabaseSecurityPosture,
  requiredIsolationCases,
  validateIsolationEvidence,
} from "../src/lib/security-readiness";

test("database drift evaluation fails missing RLS and browser grants", () => {
  const findings = evaluateDatabaseSecurityPosture({
    publicTableCount: 86,
    rlsEnabledCount: 85,
    tablesWithoutRls: ["SensitiveTable"],
    browserTableGrants: [{ grantee: "authenticated", tableName: "SensitiveTable", privileges: ["SELECT"] }],
    publicSecurityDefinerFunctions: ["unsafe_lookup"],
    unsafePublicViews: ["family_export"],
  });
  assert.deepEqual(findings.map((finding) => finding.code), [
    "RLS_COVERAGE",
    "BROWSER_GRANT",
    "SECURITY_DEFINER",
    "UNSAFE_VIEW",
  ]);
});

test("credentialed isolation evidence remains incomplete until every case passes", () => {
  const records = requiredIsolationCases.map((caseId) => ({
    caseId,
    result: "PASS" as const,
    environment: "approved-safe-test",
    testedAt: "2026-07-20T18:00:00-04:00",
    actorRole: "synthetic-role",
    expectedBoundary: "known synthetic cross-scope resource is denied",
    sanitizedEvidenceRef: `evidence/${caseId}.json`,
  }));
  assert.deepEqual(validateIsolationEvidence(records), []);
  assert.match(validateIsolationEvidence(records.slice(1))[0], /executive_cross_tenant/);
});

test("operational logs redact secrets, payment, medical, custody, and identity fields", () => {
  assert.deepEqual(redactForOperationalLog({
    status: "failed",
    client_secret: "secret-value",
    cardNumber: "4242424242424242",
    medicalCondition: "sensitive",
    custodyNotes: "sensitive",
    childName: "sensitive",
  }), {
    status: "failed",
    client_secret: "[REDACTED]",
    cardNumber: "[REDACTED]",
    medicalCondition: "[REDACTED]",
    custodyNotes: "[REDACTED]",
    childName: "[REDACTED]",
  });
});

test("client code does not reference server secrets through NEXT_PUBLIC variables", async () => {
  const files = [
    "src/lib/supabase-auth.ts",
    "src/lib/supabase-storage.ts",
    "src/lib/integrations.ts",
    ".env.example",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|STRIPE_SECRET|SENDGRID|TWILIO_AUTH)/);
  }
});

test("Stripe webhook boundary verifies signatures and payment forms do not collect raw PAN", async () => {
  const webhook = await readFile("src/app/api/billing/stripe-webhook/route.ts", "utf8");
  const paymentForm = await readFile("src/components/payment-method-request-form.tsx", "utf8");
  assert.match(webhook, /stripe-signature/);
  assert.match(webhook, /constructEvent/);
  assert.doesNotMatch(paymentForm, /name=["'](?:cardNumber|cvc|routingNumber|accountNumber)["']/i);
});

test("custody and medical mutation paths remain authenticated and audited", async () => {
  for (const file of [
    "src/app/api/families/intake/route.ts",
    "src/app/api/registration/[id]/review/route.ts",
    "src/app/api/compliance/medication-logs/route.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /getCurrentUser|requireCurrentUser|requirePermission|requireParentGuardian/);
    assert.match(source, /writeAuditLog/);
  }
});

test("CSP remains an explicit readiness item until external allowlists are tested", async () => {
  const config = await readFile("next.config.ts", "utf8");
  const audit = await readFile("docs/SECURITY_COMPLIANCE_PRODUCTION_READINESS_AUDIT_2026-07-20.md", "utf8");
  assert.doesNotMatch(config, /Content-Security-Policy/);
  assert.match(audit, /Content Security Policy/);
  assert.match(audit, /report-only allowlist/i);
});
