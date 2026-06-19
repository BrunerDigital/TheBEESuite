import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INCOMPLETE_INCIDENT_ACTION_TAKEN,
  INCOMPLETE_INCIDENT_DESCRIPTION,
  normalizeTeacherIncidentPayload,
} from "../src/lib/teacher-incident";

test("teacher incident payload saves incomplete forms for director review", () => {
  const parsed = normalizeTeacherIncidentPayload({
    childId: " child_1 ",
    type: "",
    description: "",
    actionTaken: "",
  });

  if (!parsed.ok) assert.fail(parsed.error);

  assert.equal(parsed.incident.childId, "child_1");
  assert.equal(parsed.incident.type, "Incident");
  assert.equal(parsed.incident.description, INCOMPLETE_INCIDENT_DESCRIPTION);
  assert.equal(parsed.incident.actionTaken, INCOMPLETE_INCIDENT_ACTION_TAKEN);
  assert.equal(parsed.incident.parentNotified, false);
});

test("teacher incident payload still requires a child anchor", () => {
  const parsed = normalizeTeacherIncidentPayload({
    type: "Minor injury",
    description: "Started but not linked.",
  });

  assert.equal(parsed.ok, false);
  if (parsed.ok) throw new Error("Expected missing child validation to fail.");
  assert.equal(parsed.status, 400);
  assert.match(parsed.error, /Child is required/);
});
