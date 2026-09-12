export type AutomationDraft = {
  name: string;
  trigger: string;
  audience: string;
  condition: string;
  requiresReview: boolean;
  delay: string;
  actionType: string;
  channel: string;
  templateKey: string;
  subject: string;
  body: string;
  status: string;
};

export type AutomationRecord = {
  id: string;
  name: string;
  trigger: string;
  condition: unknown;
  action: unknown;
  delay: string | null;
  status: string;
};

export function automationObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }

export function newAutomationDraft(): AutomationDraft {
  return { name: "", trigger: "manual", audience: "", condition: "", requiresReview: true, delay: "", actionType: "create_task", channel: "task", templateKey: "", subject: "", body: "", status: "draft" };
}

/** Saved nulls are blank fields, never an unrelated example campaign. */
export function automationDraftFromRecord(record: AutomationRecord): AutomationDraft {
  const condition = automationObject(record.condition), action = automationObject(record.action);
  return {
    name: record.name, trigger: record.trigger, audience: text(condition.audience), condition: text(condition.rule), requiresReview: condition.requiresReview !== false,
    delay: record.delay ?? "", actionType: text(action.type), channel: text(action.channel), templateKey: text(action.templateKey), subject: text(action.subject), body: text(action.body), status: record.status,
  };
}

export function automationDraftSignature(draft: AutomationDraft) {
  return JSON.stringify([draft.name, draft.trigger, draft.audience, draft.condition, draft.requiresReview, draft.delay, draft.actionType, draft.channel, draft.templateKey, draft.subject, draft.body, draft.status]);
}

export function normalizeAutomationDraft(value: unknown, mode: "create" | "update" = "update"): AutomationDraft {
  const input = automationObject(value);
  const clean = (key: string) => text(input[key]).trim();
  return {
    name: clean("name"), trigger: clean("trigger") || (mode === "create" ? "manual" : ""), audience: clean("audience"), condition: clean("condition"),
    requiresReview: input.requiresReview !== false && input.requiresReview !== "false", delay: clean("delay"),
    actionType: clean("actionType") || clean("action") || (mode === "create" ? "create_task" : ""), channel: clean("channel") || (mode === "create" ? "task" : ""), templateKey: clean("templateKey"), subject: clean("subject"), body: clean("body"), status: clean("status") || (mode === "create" ? "draft" : ""),
  };
}

/** Clear editable keys explicitly while retaining unrelated stored configuration. */
export function automationConfigurationData(input: AutomationDraft, existing?: Pick<AutomationRecord, "condition" | "action">) {
  const draft = normalizeAutomationDraft(input, existing ? "update" : "create");
  const action = { ...automationObject(existing?.action) };
  const condition = { ...automationObject(existing?.condition), requiresReview: draft.requiresReview } as Record<string, unknown>;
  // Structured legacy rules/audiences are not representable by these text
  // inputs. A blank input must not erase them during an unrelated edit.
  for (const [key, value] of Object.entries({ rule: draft.condition, audience: draft.audience })) {
    if (value) condition[key] = value;
    else if (!(key in condition) || condition[key] === null || typeof condition[key] === "string") condition[key] = null;
  }
  // Existing absent/null action choices remain unset until deliberately chosen.
  // A blank editable text field clears a prior string, not unrelated legacy JSON.
  for (const [key, value] of Object.entries({ type: draft.actionType, channel: draft.channel, templateKey: draft.templateKey, subject: draft.subject, body: draft.body })) {
    if (value) action[key] = value;
    else if (!existing || (key in action && (typeof action[key] === "string" || action[key] === null))) action[key] = action[key] === "" && ["type", "channel"].includes(key) ? "" : null;
  }
  return {
    name: draft.name, trigger: draft.trigger, delay: draft.delay || null, status: draft.status,
    condition,
    action,
  };
}

function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, sort(entry)])) : item;
  return JSON.stringify(sort(value));
}

export function automationRecordSignature(record: AutomationRecord) {
  return canonicalJson([record.id, record.name, record.trigger, record.condition, record.action, record.delay, record.status]);
}

export function readAutomationSaveReceipt(value: unknown, expected: { id: string; draft: AutomationDraft; existing?: AutomationRecord | null }): AutomationRecord | null {
  const response = automationObject(value), record = automationObject(response.record);
  const condition = automationObject(record.condition);
  if (response.ok !== true || response.configurationOnly !== true || response.entity !== "automation" || response.mode !== (expected.id ? "updated" : "created")
    || typeof record.id !== "string" || !record.id.trim() || (expected.id && record.id !== expected.id)
    || typeof record.name !== "string" || typeof record.trigger !== "string" || typeof record.status !== "string"
    || (record.delay !== null && typeof record.delay !== "string") || typeof condition.requiresReview !== "boolean") return null;
  const saved = record as AutomationRecord;
  const normalized = normalizeAutomationDraft(expected.draft, expected.id ? "update" : "create");
  const expectedData = automationConfigurationData(normalized, expected.existing ?? undefined);
  // Validate nullable/typed keys before mapping: a missing field is not proof it was cleared.
  if (automationDraftSignature(automationDraftFromRecord(saved)) !== automationDraftSignature(normalized)
    || canonicalJson(record.condition) !== canonicalJson(expectedData.condition) || canonicalJson(record.action) !== canonicalJson(expectedData.action)) return null;
  return saved;
}
