import assert from "node:assert/strict";
import { test } from "node:test";
import { EnrollmentStage } from "@prisma/client";
import { stageNurtureTask } from "@/lib/crm";

test("stage nurture tasks create human follow-up copy for every pipeline stage", () => {
  for (const stage of Object.values(EnrollmentStage)) {
    const task = stageNurtureTask(stage, "Rivera Family");
    assert.equal(typeof task, "string");
    assert.match(task ?? "", /Rivera Family/);
  }
});

test("stage nurture task falls back to family label when name is blank", () => {
  assert.equal(
    stageNurtureTask(EnrollmentStage.NEW_INQUIRY, ""),
    "Call family within 1 business day",
  );
});
