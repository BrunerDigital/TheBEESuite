import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automationConfigurationData, automationDraftFromRecord, automationDraftSignature, automationRecordSignature, newAutomationDraft, normalizeAutomationDraft, readAutomationSaveReceipt } from "../src/lib/automation-workflow-state";

test("new workflow resets every field and starts as a reviewed draft", () => {
  assert.deepEqual(newAutomationDraft(), { name: "", trigger: "manual", audience: "", condition: "", requiresReview: true, delay: "", actionType: "create_task", channel: "task", templateKey: "", subject: "", body: "", status: "draft" });
  const saved = automationDraftFromRecord({ id: "fake-a", name: "Blank saved workflow", trigger: "manual", condition: null, action: {}, delay: null, status: "paused" });
  for (const key of ["audience", "condition", "delay", "actionType", "channel", "templateKey", "subject", "body"] as const) assert.equal(saved[key], "");
  assert.equal(saved.requiresReview, true);
  assert.equal(saved.status, "paused");
});

test("workflow signatures track all inputs without trimming unsaved text", () => {
  const draft = newAutomationDraft(), signature = automationDraftSignature(draft);
  for (const key of Object.keys(draft) as Array<keyof typeof draft>) {
    assert.notEqual(automationDraftSignature({ ...draft, [key]: key === "requiresReview" ? false : `${draft[key]} ` }), signature, key);
  }
});

test("workflow configuration explicitly clears nullable keys and preserves unrelated JSON", () => {
  const draft = normalizeAutomationDraft({ ...newAutomationDraft(), name: " Fake ", requiresReview: false });
  const data = automationConfigurationData(draft, { condition: { rule: "old", audience: "old", requiresReview: true, customScope: { centerId: "fake-center" } }, action: { subject: "old", body: "old", customDelivery: { approved: false } } });
  assert.deepEqual(data.condition, { rule: null, audience: null, requiresReview: false, customScope: { centerId: "fake-center" } });
  assert.deepEqual(data.action, { type: "create_task", channel: "task", subject: null, body: null, customDelivery: { approved: false } });
  assert.equal(data.status, "draft");
  assert.equal(normalizeAutomationDraft({ requiresReview: "false" }).requiresReview, false);
  for (const value of [undefined, null, 0, "unexpected"]) assert.equal(normalizeAutomationDraft({ requiresReview: value }).requiresReview, true);
});

test("workflow receipt must prove exact entity, target, mode and every normalized field", () => {
  const draft = { ...newAutomationDraft(), name: " Fake workflow ", condition: " Fake rule ", requiresReview: false };
  const record = { id: "fake-a", ...automationConfigurationData(normalizeAutomationDraft(draft)) };
  const expected = { id: "fake-a", draft }, response = { ok: true, configurationOnly: true, entity: "automation", mode: "updated", record };
  assert.equal(readAutomationSaveReceipt(response, expected)?.id, "fake-a");
  assert.equal(readAutomationSaveReceipt({ ...response, mode: "created" }, { id: "", draft })?.id, "fake-a");
  for (const bad of [null, {}, { ...response, configurationOnly: undefined }, { ...response, configurationOnly: false }, { ...response, ok: false }, { ...response, entity: "campaign" }, { ...response, mode: "created" }, { ...response, record: { ...record, id: "fake-b" } }, { ...response, record: { ...record, condition: {} } }]) assert.equal(readAutomationSaveReceipt(bad, expected), null);
  const normalized = normalizeAutomationDraft(draft);
  for (const key of Object.keys(normalized) as Array<keyof typeof draft>) {
    const altered = { ...normalized, [key]: key === "requiresReview" ? true : `${normalized[key]}different` };
    assert.equal(readAutomationSaveReceipt({ ...response, record: { id: "fake-a", ...automationConfigurationData(altered) } }, expected), null, key);
  }
  for (const field of ["rule", "audience", "requiresReview"]) assert.equal(readAutomationSaveReceipt({ ...response, record: { ...record, condition: { ...record.condition, [field]: undefined } } }, expected), null, field);
});

test("workflow revision signatures use locale-independent code-unit ordering", () => {
  const row = { id: "fake", name: "Fake", trigger: "manual", status: "draft", delay: null, condition: { z: true, A: true, a: true, Ä: true, Z: true }, action: {} };
  const signature = automationRecordSignature(row);
  assert.equal(signature, automationRecordSignature({ ...row, condition: Object.fromEntries(Object.entries(row.condition).reverse()) }));
  assert.ok(signature.indexOf('"A"') < signature.indexOf('"Z"') && signature.indexOf('"Z"') < signature.indexOf('"a"') && signature.indexOf('"z"') < signature.indexOf('"Ä"'));
});

test("name-only edits never invent an action or channel for a legacy workflow", () => {
  for (const action of [{ sendEmail: true, createTask: true, aiSummary: true }, { type: null, channel: null }, { type: "", channel: "" }]) {
    const existing = { id: "fake-legacy", name: "Old name", trigger: "legacy_trigger", condition: { demoWorkspace: true }, action, delay: null, status: "active" };
    const draft = normalizeAutomationDraft({ ...automationDraftFromRecord(existing), name: "New name" });
    assert.equal(draft.actionType, ""); assert.equal(draft.channel, "");
    const record = { id: existing.id, ...automationConfigurationData(draft, existing) };
    assert.deepEqual(record.action, action);
    assert.ok(readAutomationSaveReceipt({ ok: true, configurationOnly: true, entity: "automation", mode: "updated", record }, { id: existing.id, draft, existing }));
  }
});

test("workflow receipts prove preservation of the full unrelated nested configuration", () => {
  const draft = { ...newAutomationDraft(), name: " Fake " };
  const existing = { id: "fake", name: "Prior", trigger: "manual", delay: null, status: "draft", condition: { custom: { school: "fake-school", flags: [true, false] } }, action: { legacy: { reviewed: true } } };
  const record = { id: existing.id, ...automationConfigurationData(draft, existing) };
  const receipt = { ok: true, configurationOnly: true, entity: "automation", mode: "updated", record }, expected = { id: existing.id, draft, existing };
  assert.equal(record.name, "Fake", "Normalization happens at the shared data boundary");
  assert.ok(readAutomationSaveReceipt(receipt, expected));
  for (const condition of [{ rule: null, audience: null, requiresReview: true }, { ...record.condition, custom: { school: "changed" } }, { ...record.condition, added: true }]) assert.equal(readAutomationSaveReceipt({ ...receipt, record: { ...record, condition } }, expected), null);
  assert.equal(readAutomationSaveReceipt({ ...receipt, record: { ...record, action: { ...record.action, legacy: null } } }, expected), null);
  assert.ok(readAutomationSaveReceipt({ ...receipt, record: { ...record, condition: Object.fromEntries(Object.entries(record.condition).reverse()) } }, expected), "JSON key ordering is not a change");
});

test("name-only updates preserve structured legacy rules and audiences through exact receipts", () => {
  for (const value of [{ all: [{ stage: "tour" }] }, ["fake-a", "fake-b"], 0, 42, false, true]) {
    const existing = { id: "fake-legacy", name: "Before", trigger: "manual", delay: null, status: "draft", condition: { rule: value, audience: value, requiresReview: false }, action: {} };
    const draft = { ...automationDraftFromRecord(existing), name: "After" };
    const record = { id: existing.id, ...automationConfigurationData(draft, existing) };
    assert.deepEqual(record.condition, existing.condition);
    const expected = { id: existing.id, draft, existing };
    assert.ok(readAutomationSaveReceipt({ ok: true, configurationOnly: true, entity: "automation", mode: "updated", record }, expected));
    assert.equal(readAutomationSaveReceipt({ ok: true, configurationOnly: true, entity: "automation", mode: "updated", record: { ...record, condition: { ...record.condition, rule: null } } }, expected), null);
    assert.equal(automationConfigurationData({ ...draft, condition: "Explicit replacement" }, existing).condition.rule, "Explicit replacement");
  }
});

test("workflow mobile reflow constrains grid tracks and allows complete labels and touch targets", () => {
  const component = readFileSync("src/components/automation-workflow-builder.tsx", "utf8");
  const css = readFileSync("src/components/automation-workflow.module.css", "utf8");
  assert.match(component, /grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2/);
  assert.match(component, /flex flex-wrap items-center justify-between gap-3/);
  assert.match(css, /-webkit-line-clamp: unset/);
  assert.match(css, /height: auto;[\s\S]*min-height: 44px/);
  assert.match(readFileSync("src/components/ui/select.tsx", "utf8"), /relative flex min-h-\[44px\]/);
});
