import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("family relationship map stays read-only and opens the existing controlled editor", () => {
  const map = source("src/components/family-relationship-map.tsx");
  const editor = source("src/components/family-record-editor.tsx");

  assert.match(map, /This read-only map uses the family data already visible in this workspace/);
  assert.match(map, /onSelectGuardian/);
  assert.match(map, /onSelectChild/);
  assert.match(map, /onSelectPickup/);
  assert.match(map, /onSelectEmergencyContact/);
  assert.doesNotMatch(map, /fetch\(/);
  assert.doesNotMatch(map, /\/api\//);
  assert.doesNotMatch(map, /custodyNotes\}/);
  assert.match(editor, /<FamilyRelationshipMap/);
  assert.match(editor, /findFamilyDuplicateCandidates/);
  assert.match(editor, /findGuardianDuplicateCandidates/);
  assert.match(editor, /findChildDuplicateCandidates/);
});

test("dedicated terminal uses current-family data and preserves explicit card-present confirmation", () => {
  const page = source("src/app/[slug]/page.tsx");
  const workspace = source("src/components/director-payment-terminal-workspace.tsx");
  const terminal = source("src/components/stripe-terminal-payment.tsx");

  assert.match(page, /children: \{ some: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(page, /requestedBillingWorkspace[\s\S]*=== "terminal"/);
  assert.match(workspace, /Only currently enrolled families in your visible school scope appear here/);
  assert.match(workspace, /presentation="embedded"/);
  assert.match(terminal, /parentPresent: true/);
  assert.match(terminal, /Confirm that the parent is present/);
  assert.match(terminal, /action: "process_payment"/);
  assert.doesNotMatch(workspace, /saved_method|enable_autopay|charge_saved/);
});

test("review inbox aggregates scoped counts but deep-links to separate protected workflows", () => {
  const dashboardPage = source("src/app/dashboard/page.tsx");
  const inbox = source("src/components/director-review-inbox.tsx");

  assert.match(dashboardPage, /visibleFormSubmissionWhere\(centerIds, "online_registration"\)/);
  assert.match(dashboardPage, /child: \{ family: \{ centerId: scopedCenterFilter \} \}/);
  assert.match(dashboardPage, /family: currentFamilyWhere/);
  assert.match(dashboardPage, /\/classroom-dashboard\?view=incidents/);
  assert.match(dashboardPage, /\/family-detail\?view=media/);
  assert.match(dashboardPage, /\/forms\?view=documents/);
  assert.match(dashboardPage, /\/family-detail#guardian-change-requests/);
  assert.doesNotMatch(inbox, /fetch\(|\/api\//);
});

test("closing board is responsive, touch-safe, and does not mutate attendance", () => {
  const board = source("src/components/end-of-day-closing-board.tsx");

  assert.match(board, /md:grid-cols-2 xl:grid-cols-4/);
  assert.match(board, /focus-visible:ring-2/);
  assert.match(board, /motion-reduce:transform-none/);
  assert.match(board, /\/check-in/);
  assert.match(board, /#attendance-reconciliation-ledger/);
  assert.doesNotMatch(board, /fetch\(|method: "POST"|method: "PATCH"/);
});
