import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { resolveDailyReportEmailRecipients, type DailyReportEmailRecipient } from "@/lib/daily-report-email-settings";

type DailyReportEmailMeal = {
  mealType: string;
  food: string;
  amount: string | null;
};

type DailyReportEmailNap = {
  startsAt: Date;
  endsAt: Date | null;
};

type DailyReportEmailDiaper = {
  type: string;
  occurredAt: Date;
  notes: string | null;
};

type DailyReportEmailActivity = {
  title: string;
  notes: string | null;
};

export type DailyReportEmailReport = {
  id: string;
  date: Date;
  mood: string | null;
  teacherNote: string | null;
  suppliesNeeded: string | null;
  child: {
    id: string;
    fullName: string;
    family: {
      id: string;
      name: string;
      customFields: unknown;
      guardians: Array<{
        id: string;
        fullName: string;
        email: string | null;
      }>;
    };
  };
  meals: DailyReportEmailMeal[];
  naps: DailyReportEmailNap[];
  diapers: DailyReportEmailDiaper[];
  activities: DailyReportEmailActivity[];
};

export type DailyReportEmailSummary = {
  attempted: boolean;
  reason: "sent" | "provider_failed" | "provider_not_configured" | "no_report" | "no_recipients";
  reportId: string | null;
  recipients: string[];
  configured: boolean;
  provider: "sendgrid";
  providerMessageId: string | null;
  error: string | null;
  deliveryRecorded: boolean;
  deliveryRecordError: string | null;
};

function formatWithTimeZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
}

function formatDate(date: Date, timeZone: string) {
  return formatWithTimeZone(date, timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date, timeZone: string) {
  return formatWithTimeZone(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function bulletSection(title: string, items: string[]) {
  if (!items.length) return [];
  return [title, ...items.map((item) => `- ${item}`), ""];
}

function sentence(value: string | null | undefined) {
  return value?.trim() || "";
}

export function buildDailyReportEmailText({
  report,
  centerName,
  timeZone,
}: {
  report: DailyReportEmailReport;
  centerName?: string | null;
  timeZone: string;
}) {
  const childName = report.child.fullName;
  const lines = [
    `${childName}'s daily report`,
    `Date: ${formatDate(report.date, timeZone)}`,
    "",
  ];

  const mood = sentence(report.mood);
  if (mood) lines.push(`Mood: ${mood}`, "");

  lines.push(
    ...bulletSection(
      "Meals",
      report.meals.map((meal) => {
        const amount = sentence(meal.amount);
        return `${meal.mealType}: ${meal.food}${amount ? ` (${amount})` : ""}`;
      }),
    ),
    ...bulletSection(
      "Naps",
      report.naps.map((nap) => {
        const start = formatTime(nap.startsAt, timeZone);
        const end = nap.endsAt ? formatTime(nap.endsAt, timeZone) : "end not recorded";
        return `${start} to ${end}`;
      }),
    ),
    ...bulletSection(
      "Diaper / potty",
      report.diapers.map((entry) => {
        const notes = sentence(entry.notes);
        return `${formatTime(entry.occurredAt, timeZone)}: ${entry.type}${notes ? ` - ${notes}` : ""}`;
      }),
    ),
    ...bulletSection(
      "Activities",
      report.activities.map((activity) => {
        const notes = sentence(activity.notes);
        return `${activity.title}${notes ? ` - ${notes}` : ""}`;
      }),
    ),
  );

  if (!report.meals.length && !report.naps.length && !report.diapers.length && !report.activities.length) {
    lines.push("No care entries were recorded for this report.", "");
  }

  const teacherNote = sentence(report.teacherNote);
  if (teacherNote) lines.push("Teacher note", teacherNote, "");

  const suppliesNeeded = sentence(report.suppliesNeeded);
  if (suppliesNeeded) lines.push("Supplies needed", suppliesNeeded, "");

  lines.push(`Sent by ${centerName?.trim() || "The BEE Suite"}.`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildDailyReportEmailSubject(report: DailyReportEmailReport, timeZone: string) {
  return `${report.child.fullName}'s daily report for ${formatDate(report.date, timeZone)}`;
}

function emailSummaryForSkipped(
  reason: Extract<DailyReportEmailSummary["reason"], "no_report" | "no_recipients">,
  reportId: string | null,
  recipients: DailyReportEmailRecipient[] = [],
): DailyReportEmailSummary {
  return {
    attempted: false,
    reason,
    reportId,
    recipients: recipients.map((recipient) => recipient.email),
    configured: false,
    provider: "sendgrid",
    providerMessageId: null,
    error: reason === "no_report" ? "No daily report was found for this checkout day." : "No daily report email recipients are selected.",
    deliveryRecorded: false,
    deliveryRecordError: null,
  };
}

export async function sendCheckoutDailyReportEmail({
  childId,
  tenantId,
  centerId,
  centerName,
  centerEmail,
  serviceDayStart,
  serviceDayEnd,
  checkedOutAt,
  timeZone,
}: {
  childId: string;
  tenantId: string;
  centerId?: string | null;
  centerName?: string | null;
  centerEmail?: string | null;
  serviceDayStart: Date;
  serviceDayEnd: Date;
  checkedOutAt: Date;
  timeZone: string;
}): Promise<DailyReportEmailSummary> {
  const report = await prisma.dailyReport.findFirst({
    where: {
      childId,
      date: { gte: serviceDayStart, lt: serviceDayEnd },
    },
    orderBy: [{ sentAt: "desc" }, { date: "desc" }, { id: "desc" }],
    include: {
      child: {
        select: {
          id: true,
          fullName: true,
          family: {
            select: {
              id: true,
              name: true,
              customFields: true,
              guardians: {
                orderBy: { fullName: "asc" },
                select: { id: true, fullName: true, email: true },
              },
            },
          },
        },
      },
      meals: { orderBy: { id: "asc" } },
      naps: { orderBy: { startsAt: "asc" } },
      diapers: { orderBy: { occurredAt: "asc" } },
      activities: { orderBy: { id: "asc" } },
    },
  });

  if (!report) return emailSummaryForSkipped("no_report", null);

  const recipients = resolveDailyReportEmailRecipients({
    customFields: report.child.family.customFields,
    guardians: report.child.family.guardians,
  });
  if (!recipients.length) return emailSummaryForSkipped("no_recipients", report.id, recipients);

  if (!report.sentAt) {
    await prisma.dailyReport.update({
      where: { id: report.id },
      data: { sentAt: checkedOutAt },
    });
  }

  const reportForEmail = report satisfies DailyReportEmailReport;
  const subject = buildDailyReportEmailSubject(reportForEmail, timeZone);
  const text = buildDailyReportEmailText({ report: reportForEmail, centerName, timeZone });
  const emails = recipients.map((recipient) => recipient.email);
  const email = await sendEmail({
    to: emails,
    subject,
    text,
    replyTo: centerEmail,
    fromName: centerName?.trim() || "The BEE Suite",
    categories: ["daily_report_email", "daily_report", "child_checkout"],
    customArgs: {
      purpose: "daily_report_email",
      dailyReportId: report.id,
      childId,
      familyId: report.child.family.id,
      centerId: centerId ?? undefined,
    },
    tenantId,
  });

  let deliveryRecorded = false;
  let deliveryRecordError: string | null = null;
  try {
    await recordEmailDeliveryAttempt({
      tenantId,
      centerId,
      dedupeKey: `daily-report-email:${report.id}:${serviceDayStart.toISOString()}`,
      purpose: "daily_report_email",
      to: emails,
      subject,
      text,
      replyTo: centerEmail,
      fromName: centerName?.trim() || "The BEE Suite",
      result: email,
      metadata: {
        dailyReportId: report.id,
        childId,
        familyId: report.child.family.id,
        guardianIds: recipients.map((recipient) => recipient.guardianId),
      },
    });
    deliveryRecorded = true;
  } catch (error) {
    deliveryRecordError = error instanceof Error ? error.message : "Daily report email delivery attempt could not be recorded.";
  }

  return {
    attempted: true,
    reason: email.ok ? "sent" : email.configured ? "provider_failed" : "provider_not_configured",
    reportId: report.id,
    recipients: emails,
    configured: email.configured,
    provider: "sendgrid",
    providerMessageId: email.id ?? null,
    error: email.error ?? null,
    deliveryRecorded,
    deliveryRecordError,
  };
}
