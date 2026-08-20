import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  agencyProgramSetupBlockers,
  agencyProgramStatus,
  claimAmountCents,
  claimSubmissionBlockers,
  nextRemittanceStatus,
  normalizeAgencyRequirements,
  normalizeStateCode,
  subsidyClaimNumber,
} from "../src/lib/agency-subsidy-billing";

test("agency requirements are normalized and deduplicated", () => {
  assert.deepEqual(normalizeAgencyRequirements([
    { key: "attendance", label: "Attendance detail", type: "attendance", required: true },
    { key: "attendance", label: "Duplicate", type: "attendance" },
    { label: "Authorization copy", type: "authorization" },
  ]), [
    { key: "attendance", label: "Attendance detail", type: "attendance", required: true },
    { key: "authorization:authorization-copy", label: "Authorization copy", type: "authorization", required: true },
  ]);
});

test("claim math and identifiers are deterministic", () => {
  assert.equal(normalizeStateCode(" in "), "IN");
  assert.equal(normalizeStateCode("Indiana"), "");
  assert.equal(claimAmountCents({ serviceUnits: 4.5, rateCents: 12000 }), 54000);
  assert.equal(subsidyClaimNumber({ stateCode: "IN", centerId: "center_123456", now: new Date("2026-08-14T12:00:00Z"), suffix: "abc-123" }), "SUB-IN-123456-20260814-ABC123");
});

test("submission is fail closed on program setup and documentation", () => {
  assert.deepEqual(claimSubmissionBlockers({
    submissionMethod: "agency_portal",
    documents: [{ name: "Attendance", status: "required" }],
  }), [
    "Add the school-specific provider or vendor number.",
    "Add the official agency portal URL.",
    "Document the verified direct-deposit or payment-vendor setup.",
    "Complete required item: Attendance.",
  ]);
  assert.deepEqual(claimSubmissionBlockers({
    providerNumber: "PROV-1",
    submissionMethod: "agency_portal",
    portalUrl: "https://agency.example/provider",
    paymentInstructions: "Direct deposit verified with agency vendor",
    documents: [{ name: "Attendance", status: "verified" }],
  }), []);
});

test("agency setup remains blocked until provider, submission, and payment setup are documented", () => {
  assert.deepEqual(agencyProgramSetupBlockers({ submissionMethod: "agency_portal" }), [
    "Add the school-specific provider or vendor number.",
    "Add the official agency portal URL.",
    "Document the verified direct-deposit or payment-vendor setup.",
  ]);
  assert.equal(agencyProgramStatus({
    vendorNumber: "VENDOR-9",
    submissionMethod: "secure_email",
    paymentInstructions: "ACH enrollment confirmed by agency",
  }), "active");
});

test("agency mutations require evidence and external references", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /Complete agency setup before adding child authorizations/);
  assert.match(route, /Add an evidence note or linked document before marking this item verified/);
  assert.match(route, /Enter the confirmation reference returned by the external agency channel/);
  assert.match(route, /Enter the agency decision or claim reference/);
  assert.match(route, /approvedCents <= 0/);
  assert.match(route, /Record an agency approval before posting a remittance/);
});

test("agency readiness compares authorization expiration by UTC calendar day", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), now\.getUTCDate\(\)\)/);
  assert.match(route, /expirationCutoff\.getUTCDate\(\) \+ 31/);
  assert.match(route, /authorization\.coverageEnd < expirationCutoff/);
});

test("agency approvals preserve dollar units when posted", () => {
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(workspace, /decision: "approved", approvedDollars, externalReference/);
  assert.doesNotMatch(workspace, /approvedDollars: approvedAmount/);
});

test("agency authorization entry resets and shows the selected child's saved rate", () => {
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(workspace, /key=\{`\$\{centerId\}:\$\{programId\}:\$\{familyId\}:\$\{childId\}`\}/);
  assert.match(workspace, /authorization\.childId === childId/);
  assert.match(workspace, /authorization\.agencyProgramId === programId/);
  assert.match(workspace, /Saved authorization\{selectedChildAuthorizations\.length === 1/);
  assert.match(workspace, /money\(authorization\.authorizedRateCents\).*authorization\.unitType/);
  assert.match(workspace, /Switching children clears the new-authorization fields/);
});

test("remittance status uses approved amount when available", () => {
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 20000 }), "partially_paid");
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 45000 }), "paid");
});
