import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  AI_COMMAND_MODEL,
  AI_COMMAND_MAX_BULK_RECORDS,
  aiCommandRecordIds,
  aiCommandMutationRoles,
  cleanAiPatch,
  familyAiFields,
} from "../src/lib/ai-command-mutations";

test("AI command center defaults to the current flagship model", () => {
  assert.equal(AI_COMMAND_MODEL, process.env.OPENAI_AI_COMMAND_MODEL?.trim() || "gpt-5.6-sol");
});

test("AI mutation roles match director-style school operations roles", () => {
  assert.equal(aiCommandMutationRoles.has(UserRole.CENTER_DIRECTOR), true);
  assert.equal(aiCommandMutationRoles.has(UserRole.ASSISTANT_DIRECTOR), true);
  assert.equal(aiCommandMutationRoles.has(UserRole.TEACHER), false);
  assert.equal(aiCommandMutationRoles.has(UserRole.BILLING_ADMIN), false);
  assert.equal(aiCommandMutationRoles.has(UserRole.PARENT_GUARDIAN), false);
});

test("AI patches discard fields outside the explicit allowlist", () => {
  assert.deepEqual(
    cleanAiPatch({ name: " Smith ", address: " 1 Main St ", centerId: "other", custodyNotes: "blocked", balance: 0 }, familyAiFields),
    { name: "Smith", address: "1 Main St" },
  );
});

test("AI bulk targets are deduplicated and bounded", () => {
  assert.deepEqual(aiCommandRecordIds({ recordId: " child-1 ", recordIds: ["child-1", "child-2", ""] }), ["child-1", "child-2"]);
  assert.equal(aiCommandRecordIds({ recordIds: Array.from({ length: AI_COMMAND_MAX_BULK_RECORDS + 2 }, (_, index) => `child-${index}`) }).length, AI_COMMAND_MAX_BULK_RECORDS + 1);
});

test("AI route rechecks selected-school ownership before every record mutation", async () => {
  const route = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../src/app/api/ai/command/route.ts", import.meta.url), "utf8"));
  assert.match(route, /family\.findFirst\(\{ where: \{ id: recordId, centerId: selectedCenterId \}/);
  assert.match(route, /guardian\.findFirst\(\{ where: \{ id: recordId, family: \{ centerId: selectedCenterId \} \}/);
  assert.match(route, /child\.findFirst\(\{ where: \{ id: recordId, family: \{ centerId: selectedCenterId \} \}/);
  assert.match(route, /billingAccount: \{ family: \{ centerId: selectedCenterId \} \}/);
  assert.match(route, /classroom\.findFirst\(\{[\s\S]*where: activeClassroomWhere\(\{ id: change\.value\.classroomId, centerId: selectedCenterId \}\)/);
  assert.match(route, /invoice\.status !== PaymentStatus\.OPEN/);
  assert.match(route, /canManageBilling\(user\)/);
  assert.match(route, /dedupeKey: `ai-command:\$\{user\.id\}:\$\{operationId\}:invoice:/);
  assert.match(route, /type: "ai_command_change_plan"/);
  assert.match(route, /status: "pending_review"/);
  assert.match(route, /resolveAiDataCommandPlan/);
  assert.match(route, /createdByUserId\) !== user\.id/);
  assert.match(route, /for \(const call of calls\) await preflightAiPlannedCall/);
  assert.match(route, /set_weekly_tuition/);
  assert.match(route, /if \(!canAccessCenter\(user, selectedCenterId\)\)/);
  assert.match(route, /parallel_tool_calls: false/);
  assert.match(route, /store: false/);
});
