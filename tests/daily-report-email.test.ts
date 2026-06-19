import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyReportEmailSubject, buildDailyReportEmailText, type DailyReportEmailReport } from "@/lib/daily-report-email";
import {
  dailyReportEmailRecipientCustomFields,
  readDailyReportEmailRecipientGuardianIds,
  resolveDailyReportEmailRecipientGuardianIds,
  resolveDailyReportEmailRecipients,
} from "@/lib/daily-report-email-settings";

const guardians = [
  { id: "guardian-1", fullName: "Alex Parent", email: "alex@example.com" },
  { id: "guardian-2", fullName: "Bailey Parent", email: "bailey@example.com" },
  { id: "guardian-3", fullName: "No Email", email: null },
];

test("daily report recipient settings default to all guardians with email", () => {
  assert.deepEqual(
    resolveDailyReportEmailRecipientGuardianIds({ customFields: null, guardians }),
    ["guardian-1", "guardian-2"],
  );

  assert.deepEqual(
    resolveDailyReportEmailRecipients({ customFields: null, guardians }).map((recipient) => recipient.email),
    ["alex@example.com", "bailey@example.com"],
  );
});

test("daily report recipient settings honor director-selected guardians", () => {
  const customFields = dailyReportEmailRecipientCustomFields(
    { existing: true },
    ["guardian-2", "guardian-3", "guardian-2"],
  );

  assert.deepEqual(readDailyReportEmailRecipientGuardianIds(customFields), ["guardian-2", "guardian-3"]);
  assert.equal((customFields as Record<string, unknown>).existing, true);
  assert.deepEqual(
    resolveDailyReportEmailRecipients({ customFields, guardians }).map((recipient) => recipient.email),
    ["bailey@example.com"],
  );
});

test("daily report recipient settings allow an explicit empty recipient list", () => {
  const customFields = dailyReportEmailRecipientCustomFields(null, []);
  assert.deepEqual(readDailyReportEmailRecipientGuardianIds(customFields), []);
  assert.deepEqual(resolveDailyReportEmailRecipients({ customFields, guardians }), []);
});

test("daily report email copy includes care entries and family context", () => {
  const report: DailyReportEmailReport = {
    id: "report-1",
    date: new Date("2026-06-19T16:00:00.000Z"),
    mood: "Happy",
    teacherNote: "Enjoyed circle time.",
    suppliesNeeded: "Diapers",
    child: {
      id: "child-1",
      fullName: "Mia Bee",
      family: {
        id: "family-1",
        name: "Bee Family",
        customFields: null,
        guardians,
      },
    },
    meals: [{ mealType: "Lunch", food: "Pasta", amount: "Most" }],
    naps: [{ startsAt: new Date("2026-06-19T16:15:00.000Z"), endsAt: new Date("2026-06-19T17:05:00.000Z") }],
    diapers: [{ type: "Wet", occurredAt: new Date("2026-06-19T14:30:00.000Z"), notes: "Changed" }],
    activities: [{ title: "Outdoor play", notes: "Shared well" }],
  };

  assert.equal(
    buildDailyReportEmailSubject(report, "America/New_York"),
    "Mia Bee's daily report for Friday, June 19, 2026",
  );

  const text = buildDailyReportEmailText({
    report,
    centerName: "Kid City",
    timeZone: "America/New_York",
  });

  assert.match(text, /Mia Bee's daily report/);
  assert.match(text, /Mood: Happy/);
  assert.match(text, /Lunch: Pasta \(Most\)/);
  assert.match(text, /12:15 PM to 1:05 PM/);
  assert.match(text, /Teacher note\nEnjoyed circle time\./);
  assert.match(text, /Supplies needed\nDiapers/);
  assert.match(text, /Sent by Kid City\./);
});
