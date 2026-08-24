import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canonicalizeSystemMessageTemplate } from "../src/lib/message-templates";

test("family billing copy follows each child's recurring cadence", () => {
  const familyEditor = readFileSync(new URL("../src/components/family-record-editor.tsx", import.meta.url), "utf8");

  assert.match(familyEditor, /if \(cadence === "monthly"\) return "monthly"/);
  assert.match(familyEditor, /if \(cadence === "biweekly"\) return "every two weeks"/);
  assert.match(familyEditor, /if \(cadence === "biweekly"\) return amountCents \* 2/);
  assert.match(familyEditor, /if \(cadence === "monthly"\) return "month"/);
  assert.match(familyEditor, /cadence === "four_week" \? amountCents \* 4 : amountCents/);
  assert.match(familyEditor, /Recurring tuition by child/);
  assert.match(familyEditor, /No recurring start period/);
  assert.doesNotMatch(familyEditor, /Family weekly tuition|Weekly tuition by child|No weekly tuition assigned/);
});

test("shared communications copy does not impose a weekly billing cadence", () => {
  const communications = readFileSync(new URL("../src/lib/communications-kit.ts", import.meta.url), "utf8");
  const templates = readFileSync(new URL("../src/lib/message-templates.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/communications/messages/route.ts", import.meta.url), "utf8");

  assert.match(communications, /For the billing close:/);
  assert.match(communications, /How should billing close be performed\?/);
  assert.doesNotMatch(communications, /weekly billing close/i);
  assert.match(templates, /canonicalizeSystemMessageTemplate/);
  assert.match(templates, /weekly billing close/i);
  assert.match(page, /canonicalizeSystemMessageTemplate\(template\)/);
  assert.match(route, /canonicalizeSystemMessageTemplate\(storedTemplate\)/);
  assert.match(route, /body: input\.message \|\| selectedTemplate\.body/);
  assert.match(route, /body: input\.message \|\| template\.body/);
  assert.match(route, /message = submittedTemplate\.body/);
});

test("stale system billing copy is corrected without overwriting school customizations", () => {
  const template = canonicalizeSystemMessageTemplate({
    id: "stored-template",
    name: "School billing close procedure",
    subject: "Canton custom subject",
    body: "Canton reminder: complete the weekly billing close before Friday.",
    category: "billing",
  });

  assert.equal(template.subject, "Canton custom subject");
  assert.equal(template.body, "Canton reminder: complete the billing close before Friday.");
  assert.equal(template.id, "stored-template");
});
