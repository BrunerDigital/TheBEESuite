import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { canAccessCenter, canManageBilling } from "../src/lib/auth";
import { canReviewAgencyPosting } from "../src/lib/agency-reconciliation";
import { effectiveCenterIdsForWorkspace, resolveWorkspaceState } from "../src/lib/workspace-selection";

const workspaceSource = readFileSync("src/components/agency-subsidy-workspace.tsx", "utf8");
const controlsSource = readFileSync("src/components/agency-reconciliation-controls.tsx", "utf8");
const routeSource = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");

const roleExpectations = [
  { role: UserRole.PLATFORM_OWNER, canPrepare: true, canReview: true, canSelectAll: true },
  { role: UserRole.BRAND_ADMIN, canPrepare: true, canReview: true, canSelectAll: true },
  { role: UserRole.REGIONAL_MANAGER, canPrepare: true, canReview: true, canSelectAll: true },
  { role: UserRole.CENTER_DIRECTOR, canPrepare: true, canReview: false, canSelectAll: false },
  { role: UserRole.ASSISTANT_DIRECTOR, canPrepare: true, canReview: false, canSelectAll: false },
  { role: UserRole.BILLING_ADMIN, canPrepare: true, canReview: true, canSelectAll: false },
  { role: UserRole.READ_ONLY_AUDITOR, canPrepare: false, canReview: false, canSelectAll: true },
  { role: UserRole.TEACHER, canPrepare: false, canReview: false, canSelectAll: false },
  { role: UserRole.PARENT_GUARDIAN, canPrepare: false, canReview: false, canSelectAll: false },
  { role: UserRole.AUTHORIZED_PICKUP, canPrepare: false, canReview: false, canSelectAll: false },
] as const;

function routeActionBlock(marker: string) {
  const start = routeSource.indexOf(marker);
  assert.notEqual(start, -1, `Missing route action marker: ${marker}`);
  const next = routeSource.indexOf("\n  if (action === ", start + marker.length);
  return routeSource.slice(start, next === -1 ? routeSource.length : next);
}

test("inactive exact-school workspaces retain the baseline direct remittance action", () => {
  assert.match(workspaceSource, /agencyReconciliationActivated = centerId !== "all" && data\?\.capabilities\.agencyReconciliationActivated === true/);
  assert.match(workspaceSource, /agencyReconciliationEnabled = centerId !== "all" && data\?\.capabilities\.agencyReconciliationEnabled === true/);
  assert.match(workspaceSource, /if \(!agencyReconciliationActivated\) \{[\s\S]*?setClaimAction\(\{ kind: "remit", claim \}\);[\s\S]*?return;/);
  assert.match(workspaceSource, /if \(agencyReconciliationEnabled\) \{[\s\S]*?action = "prepareRemittanceBatch";[\s\S]*?\} else \{[\s\S]*?action = "recordRemittance";/);
  assert.match(workspaceSource, /agencyReconciliationEnabled \? "Prepare remittance" : "Record remittance"/);
  assert.match(workspaceSource, /This school remains in baseline remittance mode/);
  assert.match(workspaceSource, /claimAction\.kind === "remit" && data && agencyReconciliationEnabled/);
});

test("all-locations and inactive-school views do not expose new reconciliation operations", () => {
  assert.match(workspaceSource, /readOnly=\{centerId === "all" \|\| !canManageAgencyBilling\}/);
  assert.match(workspaceSource, /if \(requestCenterId === "all" \|\| data\?\.capabilities\.canManageAgencyBilling !== true\)/);
  assert.match(workspaceSource, /centerId === "all" \? "Read claim status across authorized schools\. Choose one exact school before changing documents, decisions, or remittances\."/);
  assert.match(controlsSource, /readOnly \? \{ \.\.\.suppliedCapabilities, canManageAgencyBilling: false, canReviewAgencyPosting: false, canCloseAccountingPeriod: false, agencyReconciliationEnabled: false \}/);
  assert.match(controlsSource, /\{operationalEnabled \? <div className="grid gap-4 xl:grid-cols-2">/);
  assert.match(controlsSource, /Baseline mode · history only/);
  assert.match(controlsSource, /operationalEnabled && capabilities\.canCloseAccountingPeriod/);
});

test("the server advertises activation only for one authorized exact school", () => {
  assert.match(routeSource, /const centerIds = requestedCenterId\s+\? centerAllowed\(auth\.user, requestedCenterId\) \? \[requestedCenterId\] : \[\]\s+: auth\.user\.centerIds/);
  assert.match(routeSource, /if \(!centerIds\.length\) return NextResponse\.json\(\{ ok: false, error: "No accessible school selected\." \}, \{ status: 403 \}\)/);
  assert.match(routeSource, /const agencyReconciliationActivated = centerIds\.length === 1\s+&& activationCenters\.length === 1\s+&& activationCenters\[0\]\.agencyReconciliationEnabled/);
  assert.match(routeSource, /const agencyReconciliationEnabled = agencyReconciliationActivated && agencyReconciliationBlockers\.length === 0/);
  assert.match(routeSource, /if \(!centerId \|\| centerId === "all" \|\| !agencyMutationCenterAllowed\(auth\.user, centerId\)\)/);
});

test("inactive schools keep direct remittance while reviewed posting actions require activation", () => {
  const activeOnlyActions = [
    'if (action === "prepareRemittanceBatch")',
    'if (action === "approveRemittanceBatch")',
    'if (action === "requestBatchAllocation")',
    'if (action === "approveBatchAllocation")',
    'if (action === "requestLedgerAdjustment")',
    'if (action === "approveLedgerAdjustment" || action === "rejectLedgerAdjustment")',
    'if (action === "closeAccountingPeriod")',
  ];
  for (const marker of activeOnlyActions) {
    assert.match(routeActionBlock(marker), /await requireAgencyReconciliationEnabled\(tx, /, `${marker} must require exact-school activation`);
  }

  const adjustmentReviewBlock = routeActionBlock('if (action === "approveLedgerAdjustment" || action === "rejectLedgerAdjustment")');
  assert.ok(adjustmentReviewBlock.indexOf('if (action === "rejectLedgerAdjustment")') < adjustmentReviewBlock.indexOf("await requireAgencyReconciliationEnabled"), "historical adjustment rejection must complete before the activation-only approval gate");

  for (const marker of [
    'if (action === "rejectBatchAllocation")',
    'if (action === "reverseLedgerAdjustment")',
    'if (action === "reopenAccountingPeriod")',
    'if (action === "rejectRemittanceBatch")',
    'if (action === "reverseRemittanceBatch")',
    'if (action === "reverseRemittance")',
  ]) {
    assert.doesNotMatch(routeActionBlock(marker), /requireAgencyReconciliationEnabled/, `${marker} must remain available for authorized historical correction`);
  }

  const directRemittanceBlock = routeActionBlock('if (action === "recordRemittance")');
  assert.match(directRemittanceBlock, /if \(center\.agencyReconciliationEnabled\) throw new AgencyWorkflowError\("This school uses reviewed deposit batches\. Prepare the remittance for independent review instead of posting it directly\."/);
  assert.doesNotMatch(directRemittanceBlock, /requireAgencyReconciliationEnabled/);
});

test("new reconciliation selectors and posting controls exclude setup-required agencies", () => {
  assert.match(controlsSource, /programs\.filter\(\(program\) => program\.status === "active" && program\.setupBlockers\.length === 0 && program\.controlledLedgerBlockers\.length === 0\)/);
  assert.match(controlsSource, /accounts\.filter\(\(account\) => operationalProgramIds\.has\(account\.agencyProgramId\)\)/);
  assert.match(controlsSource, /allocationClaims\.filter\(\(claim\) => \["approved", "partially_paid"\]\.includes\(claim\.status\) && operationalProgramIds\.has\(claim\.agencyProgram\.id\)\)/);
  assert.match(controlsSource, /const canApproveBatch = operationalEnabled && operationalProgramIds\.has\(batch\.agencyProgramId\) && canResolveBatchReview/);
  assert.match(controlsSource, /const canApproveAllocation = operationalEnabled && operationalProgramIds\.has\(batch\.agencyProgramId\) && canResolveAllocation/);
  assert.match(controlsSource, /const canApproveAdjustment = operationalEnabled && operationalProgramIds\.has\(adjustment\.agencyProgramId\) && canResolveAdjustment/);
  assert.match(controlsSource, /operationalEnabled && operationalProgramIds\.has\(batch\.agencyProgramId\) && Boolean\(batch\.reviewedAt\) && ALLOCATABLE_BATCH_STATUSES/);
  assert.match(controlsSource, /if \(!operationalEnabled \|\| !selectedBatchProgram\) \{[\s\S]*?Choose a fully configured agency before preparing the batch/);
  assert.match(controlsSource, /if \(!operationalEnabled \|\| !selectedAdjustmentAccount\) \{[\s\S]*?Choose a fully configured agency account before requesting an adjustment/);
  assert.match(controlsSource, /disabled=\{pending \|\| !selectedBatchProgram\}/);
  assert.match(controlsSource, /disabled=\{pending \|\| !selectedAdjustmentAccount\}/);
});

test("historical reconciliation stays reachable and reversible after deactivation", () => {
  assert.match(workspaceSource, /data\.remittanceBatches\.length \|\| data\.adjustments\.length \|\| data\.accountingPeriods\.length \|\| data\.ledger\.entries\.length/);
  assert.match(workspaceSource, /data && showReconciliationHistory \? <AgencyReconciliationControls/);
  assert.match(workspaceSource, /baseline-history/);
  assert.match(controlsSource, /const canResolveBatchReview = batch\.status === "pending_review" && !batch\.reviewedAt && canReviewRequest\(batch\.enteredById\)/);
  assert.match(controlsSource, /const hasPostedHistory = Boolean\(batch\.reviewedAt\) \|\| batch\.status === "reconciled"/);
  assert.match(controlsSource, /const canReverseBatch = hasPostedHistory && REVERSIBLE_BATCH_STATUSES\.has\(batch\.status\) && !batch\.reversedAt && canReviewRequest\(batch\.enteredById\) && !hasSelfRequestedPendingAllocation/);
  assert.match(controlsSource, /\{canReverseBatch \? <form[\s\S]*?reverseRemittanceBatch/);
  assert.match(controlsSource, /canResolveAdjustment \? <Button[\s\S]*?rejectLedgerAdjustment/);
  assert.match(controlsSource, /adjustment\.status === "posted" && canReviewRequest\(adjustment\.requestedById\)[\s\S]*?reverseLedgerAdjustment/);
  assert.match(controlsSource, /period\.status === "closed" && capabilities\.canCloseAccountingPeriod[\s\S]*?reopenAccountingPeriod/);
});

test("all six billing roles retain baseline write access while non-billing roles remain mutation denied", () => {
  assert.deepEqual(
    [...new Set(roleExpectations.map((expectation) => expectation.role))].sort(),
    Object.values(UserRole).sort(),
    "the access-continuity matrix must cover every current user role exactly once",
  );
  for (const expectation of roleExpectations) {
    assert.equal(canManageBilling({ role: expectation.role }), expectation.canPrepare, `${expectation.role} direct record/reverse access changed`);
  }
  assert.deepEqual(
    roleExpectations.filter((expectation) => canManageBilling({ role: expectation.role })).map((expectation) => expectation.role),
    [
      UserRole.PLATFORM_OWNER,
      UserRole.BRAND_ADMIN,
      UserRole.REGIONAL_MANAGER,
      UserRole.CENTER_DIRECTOR,
      UserRole.ASSISTANT_DIRECTOR,
      UserRole.BILLING_ADMIN,
    ],
  );
  assert.deepEqual(
    roleExpectations.filter((expectation) => !canManageBilling({ role: expectation.role })).map((expectation) => expectation.role),
    [UserRole.READ_ONLY_AUDITOR, UserRole.TEACHER, UserRole.PARENT_GUARDIAN, UserRole.AUTHORIZED_PICKUP],
  );
});

test("controlled posting stays limited to a different accounting reviewer", () => {
  for (const expectation of roleExpectations) {
    assert.equal(canReviewAgencyPosting({ role: expectation.role, reviewerId: "reviewer", requestedById: "preparer" }), expectation.canReview, `${expectation.role} independent-review access changed`);
    assert.equal(canReviewAgencyPosting({ role: expectation.role, reviewerId: "same-user", requestedById: "same-user" }), false, `${expectation.role} must not self-review`);
    assert.equal(canReviewAgencyPosting({ role: expectation.role, reviewerId: " same-user ", requestedById: "same-user" }), false, `${expectation.role} must not bypass self-review with whitespace`);
  }
});

test("every role is denied an unauthorized school in an exact-school workspace", () => {
  for (const expectation of roleExpectations) {
    const workspace = resolveWorkspaceState({
      role: expectation.role,
      authorizedCenters: [{ id: "school_a", name: "School A", detail: "Authorized school" }],
      requestedSelection: "center:school_a",
    });
    const centerIds = effectiveCenterIdsForWorkspace(workspace, ["school_a"]);
    const scopedUser = { role: expectation.role, accessScope: "scoped" as const, centerIds, workspace };
    assert.equal(canAccessCenter(scopedUser, "school_a"), true, `${expectation.role} lost its authorized school`);
    assert.equal(canAccessCenter(scopedUser, "school_b"), false, `${expectation.role} gained an unauthorized school`);
  }
});

test("only portfolio roles can select all locations, and the agency UI still makes it read-only", () => {
  const authorizedCenters = [
    { id: "school_a", name: "School A", detail: "First authorized school" },
    { id: "school_b", name: "School B", detail: "Second authorized school" },
  ];
  for (const expectation of roleExpectations) {
    const workspace = resolveWorkspaceState({ role: expectation.role, authorizedCenters, requestedSelection: "all" });
    assert.equal(workspace.canSelectAll, expectation.canSelectAll, `${expectation.role} all-location selection changed`);
    assert.equal(workspace.mode === "all", expectation.canSelectAll, `${expectation.role} all-location mode changed`);
  }
  assert.match(workspaceSource, /readOnly=\{centerId === "all" \|\| !canManageAgencyBilling\}/);
  assert.match(controlsSource, /canManageAgencyBilling: false, canReviewAgencyPosting: false, canCloseAccountingPeriod: false, agencyReconciliationEnabled: false/);
});

test("baseline same-user reversal and activated independent reversal keep UI and API parity", () => {
  const directRecordBlock = routeActionBlock('if (action === "recordRemittance")');
  const directReverseBlock = routeActionBlock('if (action === "reverseRemittance")');
  assert.doesNotMatch(directRecordBlock, /canReviewAgencyPosting/);
  assert.match(directReverseBlock, /center\.agencyReconciliationEnabled/);
  assert.match(directReverseBlock, /reviewerRole: auth\.user\.role/);
  assert.match(directReverseBlock, /requireIndependentReviewer: center\.agencyReconciliationEnabled/);
  assert.match(workspaceSource, /remittance\.allocation \? <span> · batch controlled<\/span> : canManageAgencyBilling && \(!agencyReconciliationActivated \|\| \(data\?\.capabilities\.canReviewAgencyPosting && data\.capabilities\.currentUserId !== remittance\.enteredById\)\) \? <button[\s\S]*setClaimAction\(\{ kind: "reverse", claim, remittance \}\)/);
  assert.match(workspaceSource, /if \(claimAction\.kind === "reverse"\) \{ action = "reverseRemittance"/);
});

test("two-user controlled flow allows A to prepare and B to approve then reverse", () => {
  const preparerId = "user-a";
  const reviewerId = "user-b";
  assert.equal(canManageBilling({ role: UserRole.BILLING_ADMIN }), true);
  assert.equal(canReviewAgencyPosting({ role: UserRole.BILLING_ADMIN, reviewerId: preparerId, requestedById: preparerId }), false);
  assert.equal(canReviewAgencyPosting({ role: UserRole.BILLING_ADMIN, reviewerId, requestedById: preparerId }), true, "B must be able to approve A's batch");
  assert.equal(canReviewAgencyPosting({ role: UserRole.BILLING_ADMIN, reviewerId, requestedById: preparerId }), true, "B must still be able to reverse the batch after B approved it");

  const batchApprovalBlock = routeActionBlock('if (action === "approveRemittanceBatch")');
  const batchReversalBlock = routeActionBlock('if (action === "reverseRemittanceBatch")');
  assert.match(batchApprovalBlock, /canReviewAgencyPosting\(\{ role: auth\.user\.role, reviewerId: auth\.user\.id, requestedById: batch\.enteredById \}\)/);
  assert.match(batchReversalBlock, /canReviewAgencyPosting\(\{ role: auth\.user\.role, reviewerId: auth\.user\.id, requestedById: batch\.enteredById \}\)/);
  assert.doesNotMatch(batchReversalBlock, /reviewerRole/);
  assert.match(controlsSource, /const canResolveBatchReview = [^;]*canReviewRequest\(batch\.enteredById\)/);
  assert.match(controlsSource, /const canReverseBatch = [^;]*canReviewRequest\(batch\.enteredById\)[^;]*!hasSelfRequestedPendingAllocation/);
});

test("auditor UI remains readable and hides every mutation surface", () => {
  assert.match(routeSource, /!canManageBilling\(user\) && user\.role !== "READ_ONLY_AUDITOR"/);
  assert.match(routeSource, /canManageAgencyBilling: mutationCenterSelected && canManageBilling\(auth\.user\)/);
  assert.match(workspaceSource, /actionDestinations=\{!canManageAgencyBilling \? \[\] : \[/);
  assert.match(workspaceSource, /\{canManageAgencyBilling \? <div className="grid gap-4 xl:grid-cols-3">/);
  assert.match(workspaceSource, /const documentsEditable = canManageAgencyBilling/);
  assert.match(workspaceSource, /\{canManageAgencyBilling && \["draft", "ready"\]\.includes\(claim\.status\)/);
  assert.match(workspaceSource, /readOnly=\{centerId === "all" \|\| !canManageAgencyBilling\}/);
  assert.match(controlsSource, /Read-only accounting view/);
});

test("ambiguous workspace POST failures clear pending and retain the retry key", () => {
  assert.match(workspaceSource, /async function post\([\s\S]*?try \{[\s\S]*?await fetch\("\/api\/billing\/agency-claims"/);
  assert.match(workspaceSource, /Request outcome is unknown\. Refresh and check the existing claim or review queue before retrying; the same retry-safe request key was retained\./);
  assert.match(workspaceSource, /finally \{\s+if \(centerIdRef\.current === requestCenterId\) setPending\(false\);\s+\}/);
  assert.match(workspaceSource, /if \(action && await post\(action, fields\)\) \{[\s\S]*?rotateAgencyRetryKey\(remittanceStorageKey\)/);
});

test("workspace refresh failures preserve visible data and release the pending state", () => {
  assert.match(workspaceSource, /const load = useCallback\(async[\s\S]*?try \{[\s\S]*?await fetch\(`/);
  assert.match(workspaceSource, /Existing records remain visible; retry when the connection is available\./);
  assert.match(workspaceSource, /finally \{\s+if \(centerIdRef\.current === requestCenterId\) setPending\(false\);\s+\}/);
  assert.doesNotMatch(workspaceSource, /catch \{[\s\S]{0,260}?setData\(null\)/);
});

test("activated schools require complete controlled-ledger mappings without changing baseline setup status", () => {
  assert.match(routeSource, /agencyReconciliationActivationBlockers/);
  assert.match(routeSource, /agencyControlledLedgerSetupBlockers\(program\)/);
  assert.match(routeSource, /const agencyReconciliationEnabled = agencyReconciliationActivated && agencyReconciliationBlockers\.length === 0/);
  assert.match(workspaceSource, /agencyReconciliationActivated && !agencyReconciliationEnabled/);
  assert.match(workspaceSource, /Baseline direct remittance is no longer available for this school/);
  assert.match(workspaceSource, /program\.controlledLedgerBlockers\.length === 0/);
});

test("batch reversal UI mirrors the self-requested pending-allocation preflight", () => {
  const reversalBlock = routeActionBlock('if (action === "reverseRemittanceBatch")');
  assert.match(reversalBlock, /batch\.allocations\.some\(\(allocation\) => allocation\.status === "pending_review" && allocation\.requestedById === auth\.user\.id\)/);
  assert.match(reversalBlock, /reviewNotes: `Rejected because parent batch was reversed: \$\{reason\}`/);
  assert.match(
    routeActionBlock('if (action === "rejectRemittanceBatch")'),
    /reviewNotes: `Rejected because parent batch was rejected: \$\{reason\}`/,
  );
  assert.match(controlsSource, /const hasSelfRequestedPendingAllocation = pendingAllocations\.some\(\(allocation\) => allocation\.requestedById === capabilities\.currentUserId\)/);
  assert.match(controlsSource, /A different accounting reviewer must resolve that allocation before you can reverse the batch/);
});

test("server and reconciliation UI enforce the same independent-review owners", () => {
  for (const requestedByExpression of ["batch.enteredById", "allocation.requestedById", "adjustment.requestedById"]) {
    assert.match(routeSource, new RegExp(`canReviewAgencyPosting\\(\\{ role: auth\\.user\\.role, reviewerId: auth\\.user\\.id, requestedById: ${requestedByExpression.replaceAll(".", "\\.")} \\}\\)`));
  }
  assert.match(controlsSource, /const canReviewRequest = \(requestedById: string\) => capabilities\.canReviewAgencyPosting && capabilities\.currentUserId !== requestedById/);
  assert.match(controlsSource, /canResolveAllocation = allocation\.status === "pending_review" && Boolean\(batch\.reviewedAt\) && canReviewRequest\(allocation\.requestedById\)/);
  assert.match(controlsSource, /canResolveAdjustment = adjustment\.status === "pending_review" && canReviewRequest\(adjustment\.requestedById\)/);
});
