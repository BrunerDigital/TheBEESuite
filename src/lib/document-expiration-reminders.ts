import { notificationDedupeKey } from "./notification-policy";

export const DOCUMENT_EXPIRATION_LOOKAHEAD_DAYS = 30;
export const DOCUMENT_EXPIRATION_NOTIFICATION_RETENTION_DAYS = 90;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function documentExpirationWindow(now = new Date(), lookaheadDays = DOCUMENT_EXPIRATION_LOOKAHEAD_DAYS) {
  const start = startOfUtcDay(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + Math.max(1, lookaheadDays));
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

export function daysUntilExpiration(expiresAt: Date, now = new Date()) {
  const start = startOfUtcDay(now);
  const expiry = startOfUtcDay(expiresAt);
  return Math.ceil((expiry.getTime() - start.getTime()) / 86_400_000);
}

export function expirationPhrase(daysUntil: number) {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} overdue`;
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  return `in ${daysUntil} days`;
}

export function expirationPriority(daysUntil: number) {
  return daysUntil <= 7 ? "high" : "normal";
}

export function reminderDedupeKey(input: {
  kind: "document" | "certification";
  id: string;
  expiresAt: Date;
  userId: string;
}) {
  return notificationDedupeKey([
    `${input.kind}_expiration`,
    input.id,
    input.expiresAt.toISOString().slice(0, 10),
    input.userId,
  ]);
}

export function documentReminderCopy(input: {
  documentName: string;
  documentType?: string | null;
  subjectName?: string | null;
  centerLabel?: string | null;
  expiresAt: Date;
  now?: Date;
}) {
  const daysUntil = daysUntilExpiration(input.expiresAt, input.now);
  const subject = input.subjectName ? ` for ${input.subjectName}` : "";
  const type = input.documentType ? ` (${input.documentType})` : "";
  const center = input.centerLabel ? ` at ${input.centerLabel}` : "";
  return {
    title: `Document expires ${expirationPhrase(daysUntil)}: ${input.documentName}`,
    body: `${input.documentName}${type}${subject}${center} expires on ${input.expiresAt.toISOString().slice(0, 10)}.`,
    priority: expirationPriority(daysUntil),
  };
}

export function certificationReminderCopy(input: {
  certificationName: string;
  staffName: string;
  centerLabel?: string | null;
  expiresAt: Date;
  now?: Date;
}) {
  const daysUntil = daysUntilExpiration(input.expiresAt, input.now);
  const center = input.centerLabel ? ` at ${input.centerLabel}` : "";
  return {
    title: `Staff certification expires ${expirationPhrase(daysUntil)}: ${input.certificationName}`,
    body: `${input.staffName}'s ${input.certificationName}${center} expires on ${input.expiresAt.toISOString().slice(0, 10)}.`,
    priority: expirationPriority(daysUntil),
  };
}
