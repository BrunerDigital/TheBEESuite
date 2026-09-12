import type { AutomationWorkflowBuilderData } from "../../src/components/automation-workflow-builder";

export const fakeAutomations: AutomationWorkflowBuilderData["automations"] = [
  { id: "fake-automation-a", name: "Fake blank workflow", trigger: "legacy_trigger", condition: null, action: {}, delay: null, status: "paused", brand: null, runs: [] },
  { id: "fake-automation-b", name: "Fake configured workflow", trigger: "tour_completed", condition: { rule: "Fake saved rule", audience: "Fake audience", requiresReview: false, custom: { school: "fake-school" } }, action: { type: "notify_director", channel: "in_app", templateKey: null, subject: "Fake saved subject", body: "Fake saved body", legacy: { reviewed: true } }, delay: null, status: "active", brand: { name: "Fake brand" }, runs: [] },
  { id: "fake-automation-c", name: "Fake older workflow", trigger: "manual", condition: null, action: {}, delay: null, status: "draft", brand: null, runs: [] },
];
