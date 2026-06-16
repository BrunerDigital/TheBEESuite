import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fteEscalationCopy,
  resolveFteEscalationChannels,
  shouldSendExternalFteEscalation,
} from "../src/lib/fte-escalations";

test("FTE external escalations only send during configured Friday checkpoints", () => {
  assert.equal(shouldSendExternalFteEscalation(null), false);
  assert.equal(shouldSendExternalFteEscalation(undefined), false);
  assert.equal(shouldSendExternalFteEscalation("friday_8am"), true);
  assert.equal(shouldSendExternalFteEscalation("friday_5pm"), true);
});

test("FTE escalation channel preferences prefer user settings over role defaults", () => {
  const channels = resolveFteEscalationChannels(
    { id: "user_1", role: "CENTER_DIRECTOR", email: "director@example.com", phone: "+15551234567" },
    [
      { userId: null, role: "CENTER_DIRECTOR", emailEnabled: true, smsEnabled: false },
      { userId: "user_1", role: null, emailEnabled: false, smsEnabled: true },
    ],
  );

  assert.deepEqual(channels, { email: false, sms: true });
});

test("FTE escalation copy includes school, week, and urgency", () => {
  const copy = fteEscalationCopy({
    centerName: "FL | Sarasota",
    weekLabel: "2026-06-01",
    phase: "overdue",
    reminder: "Current-week FTE reports are past the Friday due window.",
    escalationLabel: "Friday 5:00 PM ET",
  });

  assert.match(copy.subject, /FTE still needed/);
  assert.match(copy.body, /Friday evening reminder/);
  assert.match(copy.body, /FL \| Sarasota/);
  assert.match(copy.body, /2026-06-01/);
  assert.match(copy.body, /Friday 5:00 PM ET/);
  assert.match(copy.sms, /Please submit the weekly FTE report/);
});

test("FTE pre-deadline copy is a friendly reminder", () => {
  const copy = fteEscalationCopy({
    centerName: "FL | Sarasota",
    weekLabel: "2026-06-01",
    phase: "due_soon",
    reminder: "Current-week FTE reports are due Friday by 12:00 PM ET.",
    escalationLabel: "Friday 8:00 AM ET",
  });

  assert.match(copy.subject, /Friendly FTE reminder/);
  assert.match(copy.body, /Friendly reminder/);
});
