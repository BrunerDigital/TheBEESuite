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
  assert.match(workspace, /key=\{`\$\{centerId\}:\$\{programId\}:\$\{familyId\}:\$\{childId\}:\$\{editingAuthorizationId\}`\}/);
  assert.match(workspace, /authorization\.childId === childId/);
  assert.match(workspace, /authorization\.agencyProgramId === programId/);
  assert.match(workspace, /Saved authorization\{selectedChildAuthorizations\.length === 1/);
  assert.match(workspace, /money\(authorization\.authorizedRateCents\).*authorization\.unitType/);
  assert.match(workspace, /authorization\.agencyProgram\.name.*money\(authorization\.authorizedRateCents\)/);
  assert.match(workspace, /Switching children clears the entry fields/);
});

test("authorization corrections fail closed and return useful duplicate guidance", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /currently enrolled child with an assigned classroom can receive a new agency authorization/);
  assert.match(route, /subsidyAuthorizations: \{ some: \{\} \}/);
  assert.match(route, /currentlyEnrolledStatusValues/);
  assert.match(route, /isCurrentlyEnrolledChildRecord/);
  assert.match(route, /action === "updateAuthorization"/);
  assert.match(route, /action === "restoreAuthorization"/);
  assert.match(route, /claims: \{ where: \{ status: \{ not: "void" \}/);
  assert.match(route, /This authorization already exists[\s\S]*Use Edit authorization/);
  assert.match(route, /Family copay cannot be negative/);
  assert.match(route, /validCurrencyInput\(body\.familyCopayDollars, true\)/);
  assert.match(route, /no more than two decimal places/);
  assert.match(route, /date\.toISOString\(\)\.slice\(0, 10\) !== text/);
  assert.match(route, /AUTHORIZATION_UNIT_TYPES/);
  assert.match(route, /updateAuthorization"\)[\s\S]*prisma\.\$transaction[\s\S]*TransactionIsolationLevel\.Serializable/);
  assert.match(workspace, /Edit authorization/);
  assert.match(workspace, /Save correction/);
  assert.match(workspace, /Restore/);
  assert.match(workspace, /Authorized units/);
  assert.match(workspace, /former child[\s\S]*review or archive/);
  assert.match(workspace, /authorization\.status === "active" && isCurrentlyEnrolledChildRecord\(authorization\.child\)/);
});

test("agency claims enforce active authorizations, periods, units, and state transitions", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /authorization\.status !== "active"/);
  assert.match(route, /isCurrentlyEnrolledChildRecord\(authorization\.child\)[\s\S]*assigned classroom can be used for a new claim/);
  assert.match(route, /servicePeriodStart: \{ lte: end \}[\s\S]*servicePeriodEnd: \{ gte: start \}/);
  assert.match(route, /exceed the authorization's total approved units/);
  assert.match(route, /unitsAtPrecision\(\(used\._sum\.serviceUnits \?\? 0\) \+ units\) > unitsAtPrecision\(authorization\.authorizedUnits\)/);
  assert.match(route, /\|\\\.\\d\+\)\$\/\.test\(text\)/);
  assert.match(route, /cannot exceed the authorization rate/);
  assert.match(route, /claim\.status !== "submitted"/);
  assert.match(route, /recordDecision"\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*findUniqueOrThrow[\s\S]*claimSubmissionBlockers/);
  assert.match(route, /Complete every required claim document before recording agency approval/);
  assert.match(route, /updateDocument"\)[\s\S]*tx\.subsidyClaim\.updateMany[\s\S]*status: \{ in: \["draft", "ready", "submitted"\] \}/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND EXISTS/);
  assert.match(route, /Documents cannot be changed after the agency decision is recorded/);
  assert.match(route, /Enter the agency denial reason or code/);
  assert.match(route, /action === "voidClaim"/);
  assert.match(route, /updateMany\(\{ where: \{ id: claim\.id, status: \{ in: \["draft", "ready"\] \} \}/);
  assert.match(route, /The claim changed before it could be voided/);
  assert.match(workspace, /Record denial/);
  assert.match(workspace, /Void draft/);
  assert.match(workspace, /name="serviceUnits"[\s\S]*step="0\.000001"/);
  assert.match(workspace, /selectedClaimAuthorization\?\.coverageStart\.slice\(0, 10\)/);
  assert.match(workspace, /selectedClaimAuthorization\?\.coverageEnd\.slice\(0, 10\)/);
  assert.match(workspace, /onError: setClaimError/);
  assert.match(workspace, /Draft claim created and added to the agency claim queue below/);
});

test("agency queue keeps new sibling claims visible and older actionable claims reachable", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /CLAIM_PAGE_SIZE = 100/);
  assert.match(route, /subsidyClaim\.findMany\([\s\S]*orderBy: \[\{ createdAt: "desc" \}, \{ dueDate: "asc" \}, \{ id: "desc" \}\][\s\S]*cursor: \{ id: claimCursor \}, skip: 1[\s\S]*take: CLAIM_PAGE_SIZE \+ 1/);
  assert.match(route, /claimPagination: \{ page: claimPage, pageSize: CLAIM_PAGE_SIZE, hasNext: hasNextClaimPage, nextCursor:/);
  assert.match(workspace, /claimPage=\$\{claimPage\}/);
  assert.match(workspace, /Claim queue page \{claimPagination\.page\}/);
  assert.match(workspace, /setClaimPage\(1\)/);
  assert.match(workspace, /setClaimError\(""\); setClaimMessage\(""\); setData\(null\)/);
  assert.match(workspace, /reloadClaimPage: 1/);
  assert.match(workspace, /const reloadPage = callbacks\.reloadClaimPage \?\? claimPage;[\s\S]*await load\(reloadPage, reloadPage === 1 \? "" : claimCursorByPage\[reloadPage\] \?\? ""\)/);
  assert.match(workspace, /exportClaims=true/);
  assert.match(workspace, /response\.blob\(\)/);
  assert.match(workspace, /const blob = await response\.blob\(\);\s+if \(centerIdRef\.current !== exportCenterId\) return;/);
  assert.match(workspace, /centerIdRef\.current !== requestCenterId/);
  assert.match(workspace, /setPending\(true\); setClaimCursorByPage/);
  assert.match(workspace, /\.finally\(\(\) => \{ if \(active\) setPending\(false\); \}\)/);
  assert.match(workspace, /<Label>Authorization<\/Label><Select value=\{authorizationId\} disabled=\{pending\}/);
  assert.match(route, /new ReadableStream<Uint8Array>/);
  assert.match(route, /orderBy: \{ id: "asc" \}/);
  assert.match(route, /take: 250/);
  assert.match(route, /cursor: \{ id: cursorId \}, skip: 1/);
  assert.match(route, /if \(exportingClaims\) return exportClaimsCsv\(centerIds\)/);
});

test("agency remittances re-read the claim inside a serializable transaction", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  const workspace = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
  assert.match(route, /const current = await tx\.subsidyClaim\.findUnique/);
  assert.match(route, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route, /REMITTANCE_METHODS/);
  assert.match(route, /That remittance reference is already recorded or the claim changed/);
  assert.match(workspace, /Record remittance/);
  assert.match(workspace, /does not charge a family or change its balance/);
});

test("agency dashboard totals use bounded database aggregates for the full non-void claim set", () => {
  const route = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");
  assert.match(route, /\$queryRaw<AgencySummaryRow\[\]>/);
  assert.match(route, /SUM\(claim\."claimedCents"\)/);
  assert.match(route, /COUNT\(\*\) FILTER \(WHERE claim\.status IN \('draft', 'ready', 'submitted'\) AND EXISTS/);
  assert.match(route, /claim\.status <> 'void'/);
  assert.doesNotMatch(route, /summaryClaims\.reduce/);
});

test("remittance status uses approved amount when available", () => {
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 20000 }), "partially_paid");
  assert.equal(nextRemittanceStatus({ claimedCents: 50000, approvedCents: 45000, paidCents: 45000 }), "paid");
});
