import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  isExecutiveRefundApproverRole,
  refundSubmissionMode,
  validateRefundDecisionInput,
} from "../src/lib/refund-approval";

test("director and billing refund submissions require executive approval", () => {
  assert.equal(refundSubmissionMode(UserRole.CENTER_DIRECTOR), "request_approval");
  assert.equal(refundSubmissionMode(UserRole.ASSISTANT_DIRECTOR), "request_approval");
  assert.equal(refundSubmissionMode(UserRole.BILLING_ADMIN), "request_approval");
});

test("every executive refund role can approve or issue refunds", () => {
  for (const role of [
    UserRole.PLATFORM_OWNER,
    UserRole.BRAND_ADMIN,
    UserRole.REGIONAL_MANAGER,
  ]) {
    assert.equal(isExecutiveRefundApproverRole(role), true);
    assert.equal(refundSubmissionMode(role), "issue");
  }
  assert.equal(isExecutiveRefundApproverRole(UserRole.READ_ONLY_AUDITOR), false);
});

test("refund approval and denial both require a recorded reason", () => {
  assert.deepEqual(validateRefundDecisionInput("approve", ""), {
    ok: false,
    error: "Enter a reason for the approval or denial.",
  });
  assert.deepEqual(validateRefundDecisionInput("deny", "no"), {
    ok: false,
    error: "Enter a reason for the approval or denial.",
  });
  assert.deepEqual(validateRefundDecisionInput("approve", "Duplicate tuition charge confirmed."), {
    ok: true,
    action: "approve",
    reason: "Duplicate tuition charge confirmed.",
  });
  assert.deepEqual(validateRefundDecisionInput("deny", "Payment belongs to another balance."), {
    ok: true,
    action: "deny",
    reason: "Payment belongs to another balance.",
  });
});

test("refund workflow is durable, server-reviewed, and server-only in Supabase", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const submitRoute = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const reviewRoute = readFileSync("src/app/api/billing/refund-requests/[id]/review/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260729222006_refund_approval_workflow.sql", "utf8");

  assert.match(schema, /model RefundRequest/);
  assert.match(submitRoute, /prisma\.refundRequest\.create/);
  assert.match(submitRoute, /type: "refund_approval"/);
  assert.match(reviewRoute, /status: "processing"/);
  assert.match(reviewRoute, /issueFamilyRefund/);
  assert.match(reviewRoute, /type: "refund_decision"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\."RefundRequest" FROM anon, authenticated/);
  assert.match(migration, /TO service_role/);
});
