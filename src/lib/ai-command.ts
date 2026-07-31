export const AI_COMMAND_GUARDRAIL_NOTE =
  "Mr. Bee outputs are drafts only. A staff member must review before sending or acting. Do not use AI to make safety, medical, custody, legal, billing, or compliance decisions.";

export type AiCommandSummaryMetrics = {
  scopeLabel: string;
  generatedAt: Date | string;
  leadCount: number;
  highIntentLeadCount: number;
  toursToday: number;
  activeChildren: number;
  checkedInChildren: number;
  staffClockedIn: number;
  openInvoices: number;
  overdueInvoices: number;
  overdueInvoiceCents: number;
  pendingIncidents: number;
  unreadMessages: number;
  unsentDailyReports: number;
  timeZone?: string;
};

export type AiSuggestionEntry = {
  label?: string;
  subject?: string;
  body: string;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function currencyFromCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.max(0, cents) / 100);
}

export function buildAiOperationsSummary(metrics: AiCommandSummaryMetrics) {
  const generatedAt = new Date(metrics.generatedAt);
  const title = `${metrics.scopeLabel} operations snapshot`;
  const urgentItems = [
    metrics.highIntentLeadCount ? countLabel(metrics.highIntentLeadCount, "high-intent lead") : "",
    metrics.pendingIncidents ? countLabel(metrics.pendingIncidents, "incident", "incidents") + " pending review" : "",
    metrics.overdueInvoices ? `${countLabel(metrics.overdueInvoices, "overdue invoice")} totaling ${currencyFromCents(metrics.overdueInvoiceCents)}` : "",
    metrics.unreadMessages ? countLabel(metrics.unreadMessages, "unread family message") : "",
  ].filter(Boolean);

  const body = [
    `${metrics.scopeLabel} has ${countLabel(metrics.activeChildren, "active child record")}, ${countLabel(metrics.checkedInChildren, "child")} currently checked in, and ${countLabel(metrics.staffClockedIn, "staff member")} clocked in.`,
    `Enrollment shows ${countLabel(metrics.leadCount, "open lead")} with ${countLabel(metrics.highIntentLeadCount, "high-intent lead")} and ${countLabel(metrics.toursToday, "tour")} scheduled today.`,
    `Family operations show ${countLabel(metrics.openInvoices, "open invoice")}, ${countLabel(metrics.overdueInvoices, "overdue invoice")}, ${countLabel(metrics.unreadMessages, "unread family message")}, and ${countLabel(metrics.unsentDailyReports, "daily report")} not sent for today.`,
    urgentItems.length ? `Suggested focus: ${urgentItems.join("; ")}.` : "Suggested focus: no urgent AI-prioritized work is visible in this scope right now.",
    `Generated ${Number.isNaN(generatedAt.getTime()) ? "now" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: metrics.timeZone || "America/New_York", timeZoneName: "short" }).format(generatedAt)}.`,
  ].join(" ");

  return { title, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseAiSuggestionEntries(value: string): AiSuggestionEntry[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: AiSuggestionEntry[] = [];
    for (const entry of parsed) {
      const record = asRecord(entry);
      const body = cleanString(record.body);
      if (!body) continue;
      entries.push({
        label: cleanString(record.label) || undefined,
        subject: cleanString(record.subject) || undefined,
        body,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export function aiSuggestionDisplayText(value: string) {
  const entries = parseAiSuggestionEntries(value);
  if (!entries.length) return value;
  return entries
    .map((entry) => [
      entry.label ? `${entry.label}:` : "",
      entry.subject ? `Subject: ${entry.subject}` : "",
      entry.body,
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}
