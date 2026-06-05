import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fteEscalationCopy,
  resolveFteEscalationChannels,
  shouldSendExternalFteEscalation,
} from "../src/lib/fte-escalations";

test("FTE external escalations wait until reports are due soon or overdue", () => {
  assert.equal(shouldSendExternalFteEscalation("open"), false);
  assert.equal(shouldSendExternalFteEscalation("due_soon"), true);
  assert.equal(shouldSendExternalFteEscalation("overdue"), true);
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
  });

  assert.match(copy.subject, /FTE Overdue/);
  assert.match(copy.body, /FL \| Sarasota/);
  assert.match(copy.body, /2026-06-01/);
  assert.match(copy.sms, /Submit the weekly FTE report/);
});
