import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInquiryProgram } from "../src/lib/inquiry-programs";

test("WordPress Kid City program choices normalize to accepted CRM programs", () => {
  assert.equal(normalizeInquiryProgram("Infant Care"), "Daycare");
  assert.equal(normalizeInquiryProgram("Toddler Care"), "Daycare");
  assert.equal(normalizeInquiryProgram("Preschool"), "Preschool");
  assert.equal(normalizeInquiryProgram("Before & After School Care"), "Before & After School Care");
  assert.equal(normalizeInquiryProgram("Summer Camp"), "Summer Camp");
  assert.equal(normalizeInquiryProgram("Not Sure Yet"), "Daycare");
  assert.equal(normalizeInquiryProgram("unsupported"), "");
});

test("Kid City strict routing excludes archived and closed schools", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile("src/app/api/inquiries/route.ts", "utf8");
  const activeOnlyFilters = source.match(/status: strictLocationRouting \? "active" : \{ not: "closed" \}/g) ?? [];
  assert.equal(activeOnlyFilters.length, 2);
});
