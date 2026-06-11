import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aiSuggestionDisplayText,
  buildAiOperationsSummary,
  parseAiSuggestionEntries,
} from "../src/lib/ai-command";

test("AI command summaries include operational counts and focus items", () => {
  const summary = buildAiOperationsSummary({
    scopeLabel: "Longmont",
    generatedAt: new Date("2026-06-11T13:00:00.000Z"),
    leadCount: 9,
    highIntentLeadCount: 2,
    toursToday: 1,
    activeChildren: 45,
    checkedInChildren: 28,
    staffClockedIn: 6,
    openInvoices: 4,
    overdueInvoices: 1,
    overdueInvoiceCents: 12345,
    pendingIncidents: 3,
    unreadMessages: 5,
    unsentDailyReports: 7,
  });

  assert.equal(summary.title, "Longmont operations snapshot");
  assert.match(summary.body, /2 high-intent leads/);
  assert.match(summary.body, /3 incidents pending review/);
  assert.match(summary.body, /\$123/);
});

test("AI command suggestion display expands stored message variants", () => {
  const raw = JSON.stringify([
    { label: "Concise", subject: "Update", body: "Hi there" },
    { label: "Warm", subject: "Update", body: "Thanks for checking in" },
  ]);

  const entries = parseAiSuggestionEntries(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].label, "Concise");
  assert.match(aiSuggestionDisplayText(raw), /Subject: Update/);
  assert.match(aiSuggestionDisplayText(raw), /Thanks for checking in/);
});
