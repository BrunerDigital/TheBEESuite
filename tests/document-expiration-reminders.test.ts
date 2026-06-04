import assert from "node:assert/strict";
import { test } from "node:test";
import {
  certificationReminderCopy,
  documentExpirationWindow,
  documentReminderCopy,
  expirationPhrase,
  expirationPriority,
  reminderDedupeKey,
} from "../src/lib/document-expiration-reminders";

test("document expiration window covers the current UTC day through the lookahead day", () => {
  const { start, end } = documentExpirationWindow(new Date("2026-06-04T16:30:00.000Z"), 30);

  assert.equal(start.toISOString(), "2026-06-04T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-07-04T23:59:59.999Z");
});

test("expiration reminder copy uses urgent language inside the final week", () => {
  assert.equal(expirationPhrase(0), "today");
  assert.equal(expirationPhrase(1), "tomorrow");
  assert.equal(expirationPhrase(8), "in 8 days");
  assert.equal(expirationPriority(7), "high");
  assert.equal(expirationPriority(8), "normal");
});

test("document reminder copy identifies the document, subject, center, and expiration date", () => {
  const copy = documentReminderCopy({
    documentName: "Immunization Record",
    documentType: "health",
    subjectName: "Avery Bee",
    centerLabel: "FL | Sarasota",
    expiresAt: new Date("2026-06-11T14:00:00.000Z"),
    now: new Date("2026-06-04T12:00:00.000Z"),
  });

  assert.equal(copy.priority, "high");
  assert.equal(copy.title, "Document expires in 7 days: Immunization Record");
  assert.equal(
    copy.body,
    "Immunization Record (health) for Avery Bee at FL | Sarasota expires on 2026-06-11.",
  );
});

test("staff certification reminder copy is user-readable for directors and staff", () => {
  const copy = certificationReminderCopy({
    certificationName: "CPR",
    staffName: "Jordan Smith",
    centerLabel: "GA | Atlanta",
    expiresAt: new Date("2026-06-20T00:00:00.000Z"),
    now: new Date("2026-06-04T12:00:00.000Z"),
  });

  assert.equal(copy.priority, "normal");
  assert.equal(copy.title, "Staff certification expires in 16 days: CPR");
  assert.equal(copy.body, "Jordan Smith's CPR at GA | Atlanta expires on 2026-06-20.");
});

test("expiration reminder dedupe keys are scoped to record, date, and user", () => {
  const first = reminderDedupeKey({
    kind: "document",
    id: "doc_1",
    expiresAt: new Date("2026-06-11T14:00:00.000Z"),
    userId: "user_1",
  });
  const duplicate = reminderDedupeKey({
    kind: "document",
    id: "doc_1",
    expiresAt: new Date("2026-06-11T23:59:59.000Z"),
    userId: "user_1",
  });
  const differentUser = reminderDedupeKey({
    kind: "document",
    id: "doc_1",
    expiresAt: new Date("2026-06-11T14:00:00.000Z"),
    userId: "user_2",
  });

  assert.equal(first, duplicate);
  assert.notEqual(first, differentUser);
});
