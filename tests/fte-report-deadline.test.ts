import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FTE_POST_DEADLINE_ESCALATION_LABEL,
  FTE_REPORTING_DEADLINE_LABEL,
  fteDueAtForWeek,
  fteExternalEscalationWindow,
  getFteDueState,
  isFteCenterInVisibleScope,
} from "../src/lib/fte-report-guardrails";

test("FTE center filters must be present in the database-derived visible scope", () => {
  const visibleCenterIds = ["tenant_a_center_1", "tenant_a_center_2"];

  assert.equal(isFteCenterInVisibleScope(visibleCenterIds, "tenant_a_center_2"), true);
  assert.equal(isFteCenterInVisibleScope(visibleCenterIds, "tenant_b_center_1"), false);
  assert.equal(isFteCenterInVisibleScope(visibleCenterIds, ""), false);
});

test("FTE weekly deadline is Friday by noon Eastern for Kid City USA operations", () => {
  assert.equal(FTE_REPORTING_DEADLINE_LABEL, "Friday by 12:00 PM ET");
  assert.equal(
    fteDueAtForWeek(new Date("2026-06-08T00:00:00.000Z")).toISOString(),
    "2026-06-12T16:00:00.000Z",
  );
  assert.equal(
    fteDueAtForWeek(new Date("2026-12-07T00:00:00.000Z")).toISOString(),
    "2026-12-11T17:00:00.000Z",
  );
});

test("FTE due state treats Friday morning as due today and Friday afternoon as overdue", () => {
  const beforeNoon = getFteDueState(new Date("2026-06-12T15:59:00.000Z"));
  assert.equal(beforeNoon.phase, "due_soon");
  assert.equal(beforeNoon.label, "Due today");
  assert.equal(beforeNoon.deadlineLabel, "Friday by 12:00 PM ET");
  assert.match(beforeNoon.reminder, /Friday by 12:00 PM ET/);

  const afterNoon = getFteDueState(new Date("2026-06-12T16:01:00.000Z"));
  assert.equal(afterNoon.phase, "overdue");
  assert.equal(afterNoon.priority, "high");
  assert.match(afterNoon.reminder, /Friday noon deadline/);
});

test("FTE external escalations fire only on Friday evening", () => {
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-11T14:00:00.000Z")), null);
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-12T11:59:00.000Z")), null);
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-12T12:00:00.000Z")), null);
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-12T15:59:00.000Z")), null);
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-12T16:30:00.000Z")), null);
  assert.equal(fteExternalEscalationWindow(new Date("2026-06-12T20:59:00.000Z")), null);

  const junePostDeadline = fteExternalEscalationWindow(new Date("2026-06-12T21:00:00.000Z"));
  assert.equal(junePostDeadline?.key, "friday_5pm");
  assert.equal(junePostDeadline?.label, FTE_POST_DEADLINE_ESCALATION_LABEL);
  assert.equal(
    fteExternalEscalationWindow(new Date("2026-06-13T04:00:00.000Z")),
    null,
  );

  assert.equal(fteExternalEscalationWindow(new Date("2026-12-11T13:00:00.000Z")), null);
  assert.equal(
    fteExternalEscalationWindow(new Date("2026-12-11T22:00:00.000Z"))?.key,
    "friday_5pm",
  );
});

test("FTE reminders have one Friday evening production schedule", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const schedules = (config.crons ?? []).filter((cron) => cron.path === "/api/cron/fte-reminders");

  assert.deepEqual(schedules, [
    { path: "/api/cron/fte-reminders", schedule: "0 22 * * 5" },
  ]);
});
