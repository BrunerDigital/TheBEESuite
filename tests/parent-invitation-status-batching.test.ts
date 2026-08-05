import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/api/parent/invitations/route.ts", import.meta.url), "utf8");
const button = readFileSync(new URL("../src/components/parent-portal-invite-button.tsx", import.meta.url), "utf8");

test("parent invitation status cards batch their initial lookup", () => {
  assert.match(button, /pendingStatusRequests/);
  assert.match(button, /guardianIds: batch\.join\(","\)/);
  assert.doesNotMatch(button, /fetch\(`\/api\/parent\/invitations\?guardianId=/);
});

test("parent invitation status route supports a bounded batch without removing the singular contract", () => {
  assert.match(route, /MAX_STATUS_BATCH_SIZE = 200/);
  assert.match(route, /searchParams\.get\("guardianIds"\)/);
  assert.match(route, /where: \{ id: \{ in: requestedGuardianIds \} \}/);
  assert.match(route, /if \(guardianIds\.length\) return NextResponse\.json\(\{ ok: true, statuses \}\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, \.\.\.statuses\[guardianId\] \}\)/);
});
