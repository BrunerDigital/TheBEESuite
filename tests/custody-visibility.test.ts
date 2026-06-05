import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CUSTODY_WARNING_DETAIL,
  CUSTODY_WARNING_LABEL,
  custodyWarningPreview,
  custodyWarningSummary,
  hasCustodyWarning,
  normalizeCustodyNotes,
} from "../src/lib/custody-visibility";

test("custody warning helpers detect restricted notes", () => {
  assert.equal(CUSTODY_WARNING_LABEL, "Custody / pickup review");
  assert.equal(hasCustodyWarning({ custodyNotes: "  pickup requires director approval " }), true);
  assert.equal(hasCustodyWarning({ custodyNotes: "   " }), false);
  assert.equal(hasCustodyWarning(null), false);
  assert.equal(normalizeCustodyNotes("  court order on file  "), "court order on file");
});

test("custody warning summary and preview are staff-facing", () => {
  assert.equal(custodyWarningSummary({ custodyNotes: "note" }), CUSTODY_WARNING_DETAIL);
  assert.equal(custodyWarningSummary({ custodyNotes: "" }), null);
  assert.equal(custodyWarningPreview({ custodyNotes: "abcdefghijklmnopqrstuvwxyz" }, 10), "abcdefghi...");
});
