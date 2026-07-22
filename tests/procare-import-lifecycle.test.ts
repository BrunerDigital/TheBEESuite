import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync(new URL("../src/app/api/imports/procare/route.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/procare-import-panel.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

function section(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return source.slice(startIndex, endIndex < 0 ? source.length : endIndex);
}

test("fresh ProCare commits reuse the exact persisted review instead of repeating the full preview", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  const fullPreviewCalls = postHandler.match(/\bpreviewImportRows\s*\(/g)?.length ?? 0;
  const panelPostsPersistedReview = /formData\.set\(\s*["']reviewFingerprint["']\s*,\s*preview(?:\?\.|\.)reviewFingerprint/.test(panel)
    && /formData\.set\(\s*["']sourceSha256["']\s*,\s*preview(?:\?\.|\.)sourceSha256/.test(panel);
  const routeReadsPersistedReview = /formData\.get\(\s*["']reviewFingerprint["']\s*\)/.test(postHandler)
    && /formData\.get\(\s*["']sourceSha256["']\s*\)/.test(postHandler);

  assert.deepEqual(
    { fullPreviewCalls, panelPostsPersistedReview, routeReadsPersistedReview },
    { fullPreviewCalls: 1, panelPostsPersistedReview: true, routeReadsPersistedReview: true },
    "The only full preview call must be the explicit dry run; a fresh commit must submit and validate the persisted SHA/fingerprint review.",
  );
});

test("ProCare external IDs are authoritative before names, email addresses, or phone numbers", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  const staffLookup = section(route, "async function findExistingImportedStaffProfile", "type DuplicateMatchMode");
  const guardianSync = section(postHandler, "const syncGuardian", "await syncGuardian({");
  const childSync = section(postHandler, "const externalChildren = childExternalId", "if (!existingChild)");

  const familyUsesIdFirst = /(?:const family(?:Matchers|IdentityWhere)\s*=\s*accountExternalId\s*\?|const existing\s*=\s*accountExternalId\s*\?)/.test(postHandler);
  const guardianUsesIdFirst = /(?:const guardian(?:Matchers|IdentityWhere)\s*=\s*externalId\s*\?|const existingGuardian\s*=\s*externalId\s*\?)/.test(guardianSync);
  const childUsesIdFirst = /(?:const child(?:Matchers|IdentityWhere)\s*=\s*childExternalId\s*\?|where:\s*childExternalId\s*\?|const existingChild\s*=\s*childExternalId\s*\?)/.test(childSync);
  const staffUsesIdFirst = /(?:const (?:matchers|identityWhere)\s*[^=]*=\s*input\.externalId\s*\?|if\s*\(input\.externalId\)[\s\S]*?return\s+prisma\.staffProfile\.findFirst)/.test(staffLookup);

  assert.deepEqual(
    { familyUsesIdFirst, guardianUsesIdFirst, childUsesIdFirst, staffUsesIdFirst },
    { familyUsesIdFirst: true, guardianUsesIdFirst: true, childUsesIdFirst: true, staffUsesIdFirst: true },
    "When a ProCare external ID is present, fallback identity fields must not redirect the row to a different existing record.",
  );
});

test("ProCare updates merge import metadata into existing custom fields", () => {
  const mergeHelperExists = /(?:function|const)\s+merge(?:Procare)?CustomFields\b/.test(route);
  const mergeUses = route.match(/customFields:\s*merge(?:Procare)?CustomFields\s*\(/g)?.length ?? 0;

  assert.equal(mergeHelperExists, true, "Add one JSON-safe customFields merge helper for ProCare updates.");
  assert.ok(
    mergeUses >= 4,
    `Expected family, guardian, child, and staff updates to merge customFields; found ${mergeUses} merge call(s).`,
  );
});

test("ProCare Checked values map to true without treating Unchecked as true", () => {
  const body = route.match(/function boolValue\(input: string\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(body, "The ProCare boolean parser must remain available to the import route.");
  const boolValue = new Function("input", body) as (input: string) => boolean;

  assert.equal(boolValue("Checked"), true);
  assert.equal(boolValue(" checked "), true);
  assert.equal(boolValue("Unchecked"), false);
});

test("ProCare balances validate currency and support accounting negatives", () => {
  const body = route.match(/function parseCurrencyCents\(input: string\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(body, "The ProCare currency parser must remain available to the import route.");
  const parseCurrencyCents = new Function("input", body) as (input: string) => { present: boolean; valid: boolean; cents: number };

  assert.deepEqual(parseCurrencyCents("$1,234.56"), { present: true, valid: true, cents: 123456 });
  assert.deepEqual(parseCurrencyCents("($123.45)"), { present: true, valid: true, cents: -12345 });
  assert.deepEqual(parseCurrencyCents("not a balance"), { present: true, valid: false, cents: 0 });
  assert.deepEqual(parseCurrencyCents(""), { present: false, valid: true, cents: 0 });
});

test("classrooms without a ProCare room ID reuse the same school classroom name", () => {
  const classroomSync = section(route, "async function findOrCreateClassroom", "type ImportCenter");
  assert.match(classroomSync, /providedClassroomExternalId/);
  assert.match(classroomSync, /const matches = providedClassroomExternalId/);
  assert.match(classroomSync, /where: \{ centerId, name \}/);
});

test("all resolved ProCare payer records are synchronized as guardians", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  assert.match(route, /procare account person records/);
  assert.match(route, /person type/);
  assert.match(postHandler, /procareGuardianImports\(rawData\)/);
  assert.match(postHandler, /await syncGuardian\(guardian\)/);
});

test("review and commit use the same parent plan and verify family links before completing a row", () => {
  const preview = section(route, "async function previewImportRows", "async function importPayloadFromFiles");
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");

  assert.match(preview, /const guardianImports = procareGuardianImports\(rawData\)/);
  assert.match(preview, /sourceGuardianGroups: importGuardianKeys\.size/);
  assert.match(preview, /familyChildLinks: familyChildLinkKeys\.size/);
  assert.match(preview, /familyGuardianLinks: familyGuardianLinkKeys\.size/);
  assert.match(postHandler, /linkedChildCount[\s\S]*?familyId: family\.id/);
  assert.match(postHandler, /linkedGuardianCount[\s\S]*?familyId: family\.id/);
  assert.match(postHandler, /This row was rolled back safely/);
  assert.match(panel, /Parent profiles/);
  assert.match(panel, /Family profile links/);
});

test("sparse staff exports do not reactivate or erase existing staff fields", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  const staffSync = section(postHandler, "const employeeStatus = value", "if (generatedLogin)");

  assert.match(staffSync, /employeeStatusProvided\s*\?\s*\{\s*isActive:\s*employeeIsActive\s*\}/);
  assert.match(staffSync, /staffClassroomName\s*\?\s*\{\s*classroomId:\s*staffClassroomId\s*\}/);
  assert.match(staffSync, /staffTitle\s*\?\s*\{\s*title:\s*staffTitle\s*\}/);
  assert.match(staffSync, /staffPhone\s*\?\s*\{\s*phone:\s*staffPhone\s*\}/);
  assert.match(staffSync, /backgroundCheckStatus\s*\?\s*\{\s*backgroundCheckStatus\s*\}/);
});

test("each family row commits atomically and complete relationship reports remove only stale ProCare records", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  const familyWrite = section(postHandler, "const familyWrite = await prisma.$transaction", "rowResults.push({");

  assert.match(familyWrite, /async \(prisma\) =>/);
  assert.match(familyWrite, /findOrCreateClassroom\([\s\S]*?\}, prisma\)/);
  assert.match(familyWrite, /completeRelationshipIdsByAccount/);
  assert.match(familyWrite, /prisma\.guardian\.deleteMany/);
  assert.match(familyWrite, /prisma\.emergencyContact\.deleteMany/);
  assert.match(familyWrite, /prisma\.authorizedPickup\.deleteMany/);
  assert.match(familyWrite, /sourceSystem:\s*["']procare["']/);
  assert.match(familyWrite, /staleGuardianExternalIds[\s\S]*?desiredRelationships\.guardians\.size[\s\S]*?\{\s*not:\s*null\s*\}/);
  assert.match(familyWrite, /prisma\.guardian\.findFirst\([\s\S]*?checkLogs:\s*\{\s*some:\s*\{\s*\}\s*\}[\s\S]*?dataDeletionRequests:\s*\{\s*some:\s*\{\s*\}\s*\}/);
  assert.match(familyWrite, /stale ProCare guardian has retained check-in or privacy-request history/);
  assert.doesNotMatch(familyWrite, /sourceSystem:\s*\{\s*not:/);
});

test("relationship reconciliation counts all ProCare-owned external-ID rows across source families", () => {
  const reconciliation = section(route, 'if (reportType === "reconciliation")', "const exportPayload");

  assert.match(reconciliation, /procareRelationshipRowsAcrossSourceFamilies/);
  assert.match(reconciliation, /family:\s*\{\s*centerId,\s*sourceSystem:\s*["']procare["'],\s*externalId\s*\}/);
  assert.match(reconciliation, /sourceSystem:\s*["']procare["']/);
  assert.match(reconciliation, /externalId:\s*\{\s*not:\s*null\s*\}/);
  assert.match(reconciliation, /prisma\.guardian\.count\(\{\s*where:\s*\{\s*OR:\s*procareRelationshipRowsAcrossSourceFamilies/);
  assert.match(reconciliation, /prisma\.emergencyContact\.count\(\{\s*where:\s*\{\s*OR:\s*procareRelationshipRowsAcrossSourceFamilies/);
  assert.match(reconciliation, /prisma\.authorizedPickup\.count\(\{\s*where:\s*\{\s*OR:\s*procareRelationshipRowsAcrossSourceFamilies/);
});

test("staff creation and its audit record commit in the same transaction", () => {
  const postHandler = section(route, "async function POSTHandler", "async function PATCHHandler");
  const staffTransaction = section(postHandler, "const staffWrite = await prisma.$transaction", "if (existingStaff) updatedStaff");

  assert.match(staffTransaction, /tx\.user\.(?:create|update)/);
  assert.match(staffTransaction, /tx\.staffProfile\.(?:create|update)/);
  assert.match(staffTransaction, /tx\.auditLog\.create/);
  assert.doesNotMatch(staffTransaction, /writeAuditLog\(/);
});

test("existing children receive canonical ProCare field updates", () => {
  const childUpdate = section(route, "await prisma.child.update({", "        }");
  const requiredCanonicalFields = [
    "familyId",
    "fullName",
    "preferredName",
    "dateOfBirth",
    "photoVideoPermission",
    "fieldTripPermission",
  ];
  const missing = requiredCanonicalFields.filter((field) => !new RegExp(`\\b${field}\\s*:`).test(childUpdate));

  assert.deepEqual(
    missing,
    [],
    "A matched ProCare child must be moved/renamed and have DOB, preferred name, and permission fields refreshed from the canonical export.",
  );
});

test("an explicit zero ProCare balance clears the existing billing balance", () => {
  const balanceLifecycle = section(route, "const balanceCents = parsedBalance.cents", "rowResults.push({");

  assert.doesNotMatch(
    balanceLifecycle,
    /if\s*\(\s*balanceCents\s*\)/,
    "A truthiness guard drops an explicit $0.00 balance and leaves stale dashboard balances behind.",
  );
  assert.match(balanceLifecycle, /prisma\.billingAccount\.upsert\s*\(/);
  assert.match(balanceLifecycle, /if\s*\(\s*balanceCents\s*>\s*0\s*\)/);
});

test("ProCare row checkpoints are unique and safe to retry after a lost response", () => {
  const rowModel = section(schema, "model ProcareImportRow", "model ");
  const saveRows = section(route, "await prisma.procareImportRow.createMany({", "const cumulativeNumber");
  const uniqueCheckpoint = /@@unique\(\s*\[\s*batchId\s*,\s*rowNumber\s*\]\s*\)/.test(rowModel);
  const retrySafeWrite = /skipDuplicates\s*:\s*true/.test(saveRows)
    || /procareImportRow\.upsert\s*\([\s\S]*batchId_rowNumber/.test(route);

  assert.deepEqual(
    { uniqueCheckpoint, retrySafeWrite },
    { uniqueCheckpoint: true, retrySafeWrite: true },
    "The same batch chunk may be replayed after a timeout; its row checkpoints must not duplicate or fail the resumed import.",
  );
});

test("the timeout UI preserves the browser file-source contract", () => {
  const failedResponse = section(panel, "if (!response.ok)", "if (json?.dryRun)");
  const tellsUserToRefresh = /Refresh the page before trying again\./.test(failedResponse);
  const explainsSafeRetry = /(?:keep this page open|same selected files|reselect the same|selected files[^.]*try again)/i.test(failedResponse);
  const clearsSelectedFiles = /setSelectedFiles\(\[\]\)/.test(failedResponse);

  assert.deepEqual(
    { tellsUserToRefresh, explainsSafeRetry, clearsSelectedFiles },
    { tellsUserToRefresh: false, explainsSafeRetry: true, clearsSelectedFiles: false },
    "Browsers cannot restore File objects after refresh; timeout guidance must preserve or explicitly request the exact same selected source.",
  );
});
