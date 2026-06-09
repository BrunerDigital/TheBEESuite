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
  { token: "guardian.email", label: "Primary guardian email" },
  { token: "child.names", label: "Child names" },
  { token: "child.firstNames", label: "Child first names" },
  { token: "classroom.names", label: "Classroom names" },
  { token: "center.name", label: "School name" },
  { token: "center.email", label: "School email" },
  { token: "center.phone", label: "School phone" },
  { token: "sender.name", label: "Staff name" },
  { token: "sender.role", label: "Staff role" },
  { token: "date.today", label: "Today" },
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
  {
    id: "default-attendance",
    name: "Attendance reminder",
    subject: "Attendance reminder from {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nWe are checking in about attendance for {{child.names}} today. Please contact {{center.name}} if your family needs schedule support or if your child will be absent.",
    category: "attendance",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "child.names", "center.name"],
  },
  {
    id: "default-document-expiration",
    name: "Expiring document reminder",
    subject: "Document update needed for {{child.names}}",
    body: "Hi {{guardian.firstName}},\n\nA document for {{child.names}} needs attention. Please upload the updated file in the parent portal or contact {{center.name}} if you need help.",
    category: "documents",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "child.names", "center.name"],
  },
  {
    id: "default-registration-next-steps",
    name: "Registration next steps",
    subject: "Next steps for {{family.name}}",
    body: "Hi {{guardian.firstName}},\n\nThank you for completing registration. Our team is reviewing the packet for {{child.names}} and will follow up with classroom, tuition, and start-date next steps.",
    category: "enrollment",
    channel: "portal_reply",
    mergeFields: ["guardian.firstName", "family.name", "child.names"],
  },
  {
    id: "default-broadcast-classroom",
    name: "Classroom broadcast",
    subject: "Update from {{classroom.names}}",
    body: "Hi {{guardian.firstName}},\n\nWe have an update for families in {{classroom.names}}. Please review the parent portal and contact {{center.name}} with any questions.",
    category: "broadcast",
    channel: "broadcast",
    mergeFields: ["guardian.firstName", "classroom.names", "center.name"],
  },
  {
    id: "default-broadcast-center",
    name: "Center-wide broadcast",
    subject: "Update from {{center.name}}",
    body: "Hi {{guardian.firstName}},\n\nWe have an important update for {{center.name}} families. Please review this message and contact us at {{center.phone}} or {{center.email}} with any questions.",
    category: "broadcast",
    channel: "broadcast",
    mergeFields: ["guardian.firstName", "center.name", "center.phone", "center.email"],
  },
];

export type MessageTemplateContext = {
  familyName?: string | null;
  guardianFirstName?: string | null;
  guardianFullName?: string | null;
  guardianEmail?: string | null;
  childNames?: string[] | null;
  childFirstNames?: string[] | null;
  classroomNames?: string[] | null;
  centerName?: string | null;
  centerEmail?: string | null;
  centerPhone?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
  today?: Date | string | null;
};

function formatToday(value: Date | string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function tokenValues(context: MessageTemplateContext) {
  return {
    "family.name": context.familyName ?? "your family",
    "guardian.firstName": context.guardianFirstName ?? "there",
    "guardian.fullName": context.guardianFullName ?? "there",
    "guardian.email": context.guardianEmail ?? "your family email",
    "child.names": context.childNames?.length ? context.childNames.join(", ") : "your child",
    "child.firstNames": context.childFirstNames?.length
      ? context.childFirstNames.join(", ")
      : context.childNames?.length
        ? context.childNames.map((name) => name.split(" ")[0]).join(", ")
        : "your child",
    "classroom.names": context.classroomNames?.length ? context.classroomNames.join(", ") : "your classroom",
    "center.name": context.centerName ?? "the school",
    "center.email": context.centerEmail ?? "the school office",
    "center.phone": context.centerPhone ?? "the school office",
    "sender.name": context.senderName ?? "the school team",
    "sender.role": context.senderRole ?? "school team",
    "date.today": formatToday(context.today),
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
