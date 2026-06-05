export type MessageTemplateView = {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  channel: string;
  mergeFields: string[];
};

export type MessageMergeField = {
  token: string;
  label: string;
};

export const messageMergeFields: MessageMergeField[] = [
  { token: "family.name", label: "Family name" },
  { token: "guardian.firstName", label: "Primary guardian first name" },
  { token: "guardian.fullName", label: "Primary guardian full name" },
  { token: "child.names", label: "Child names" },
  { token: "center.name", label: "School name" },
  { token: "center.email", label: "School email" },
  { token: "center.phone", label: "School phone" },
  { token: "sender.name", label: "Staff name" },
];

export const defaultMessageTemplates: MessageTemplateView[] = [
  {
    id: "default-general",
    name: "General follow-up",
    subject: "Follow-up from {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nThank you for reaching out. We reviewed your note for {{family.name}} and will follow up with any next steps in the parent portal.",
    category: "general",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "family.name", "center.name"],
  },
  {
    id: "default-documents",
    name: "Document request",
    subject: "Document request follow-up",
    body: "Hi {{guardian.firstName}},\n\nWe reviewed the document request for {{child.names}}. The office will update your family record after verification is complete.",
    category: "documents",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "child.names"],
  },
  {
    id: "default-billing",
    name: "Billing follow-up",
    subject: "Billing follow-up for {{family.name}}",
    body: "Hi {{guardian.firstName}},\n\nWe are reviewing your account balance and will follow up with invoice or payment updates in the parent portal.",
    category: "billing",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "family.name"],
  },
  {
    id: "default-classroom",
    name: "Classroom update",
    subject: "Classroom update for {{child.names}}",
    body: "Hi {{guardian.firstName}},\n\nThank you for the note. We will share this with the classroom team and keep the daily report updated.",
    category: "classroom",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "child.names"],
  },
  {
    id: "default-incident",
    name: "Incident follow-up",
    subject: "Incident report follow-up",
    body: "Hi {{guardian.firstName}},\n\nThank you for reviewing the incident note. A director will complete the final review before any additional action is recorded.",
    category: "incident",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName"],
  },
];

export type MessageTemplateContext = {
  familyName?: string | null;
  guardianFirstName?: string | null;
  guardianFullName?: string | null;
  childNames?: string[] | null;
  centerName?: string | null;
  centerEmail?: string | null;
  centerPhone?: string | null;
  senderName?: string | null;
};

function tokenValues(context: MessageTemplateContext) {
  return {
    "family.name": context.familyName ?? "your family",
    "guardian.firstName": context.guardianFirstName ?? "there",
    "guardian.fullName": context.guardianFullName ?? "there",
    "child.names": context.childNames?.length ? context.childNames.join(", ") : "your child",
    "center.name": context.centerName ?? "the school",
    "center.email": context.centerEmail ?? "the school office",
    "center.phone": context.centerPhone ?? "the school office",
    "sender.name": context.senderName ?? "the school team",
  } satisfies Record<string, string>;
}

export function renderMessageTemplate(input: string, context: MessageTemplateContext) {
  const values: Record<string, string> = tokenValues(context);
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, token: string) => values[token] ?? match);
}

export function normalizeMergeFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export const notificationPreferenceTypes = [
  { type: "messages", label: "Family messages" },
  { type: "billing", label: "Billing and tuition" },
  { type: "documents", label: "Documents and signatures" },
  { type: "incidents", label: "Incidents and health" },
  { type: "classroom", label: "Classroom activity" },
  { type: "enrollment", label: "Enrollment and leads" },
  { type: "fte_reports", label: "FTE reports" },
];
