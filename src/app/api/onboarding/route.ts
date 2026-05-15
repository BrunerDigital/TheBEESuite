import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type OnboardingPayload = {
  brandName?: unknown;
  workEmail?: unknown;
  centerCount?: unknown;
  state?: unknown;
  timeline?: unknown;
  priority?: unknown;
  payoutAdminName?: unknown;
  payoutAdminEmail?: unknown;
  payoutReadiness?: unknown;
  notes?: unknown;
  pageUrl?: unknown;
};

type NormalizedPayload = ReturnType<typeof normalizePayload>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => isEmail(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizePayload(input: OnboardingPayload) {
  return {
    brandName: clean(input.brandName),
    workEmail: clean(input.workEmail).toLowerCase(),
    centerCount: clean(input.centerCount),
    state: clean(input.state),
    timeline: clean(input.timeline),
    priority: clean(input.priority),
    payoutAdminName: clean(input.payoutAdminName),
    payoutAdminEmail: clean(input.payoutAdminEmail).toLowerCase(),
    payoutReadiness: clean(input.payoutReadiness),
    notes: clean(input.notes),
    pageUrl: clean(input.pageUrl),
  };
}

function validate(payload: NormalizedPayload) {
  const errors: Record<string, string> = {};
  if (!payload.brandName) errors.brandName = "Brand name is required.";
  if (!isEmail(payload.workEmail)) errors.workEmail = "A valid work email is required.";
  if (!payload.centerCount || Number.parseInt(payload.centerCount, 10) < 1) errors.centerCount = "Number of centers is required.";
  if (!payload.state) errors.state = "Primary state or region is required.";
  if (!payload.timeline) errors.timeline = "Launch timeline is required.";
  if (!payload.priority) errors.priority = "First priority is required.";
  if (!payload.payoutAdminName) errors.payoutAdminName = "Payout setup owner is required.";
  if (!isEmail(payload.payoutAdminEmail)) errors.payoutAdminEmail = "A valid payout setup email is required.";
  if (!payload.payoutReadiness) errors.payoutReadiness = "Stripe Connect readiness is required.";
  return errors;
}

function getNotificationRecipients() {
  return uniqueEmails([
    ...(process.env.ONBOARDING_NOTIFICATION_EMAILS?.split(",") ?? []),
    ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
  ]);
}

async function sendOnboardingEmail(payload: NormalizedPayload, notificationId: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  const recipients = getNotificationRecipients();

  if (!apiKey || !from || !recipients.length) {
    return { ok: true, skipped: true, recipients: 0 };
  }

  const lines = [
    `Brand: ${payload.brandName}`,
    `Work email: ${payload.workEmail}`,
    `Centers: ${payload.centerCount}`,
    `Primary region: ${payload.state}`,
    `Launch timeline: ${payload.timeline}`,
    `First priority: ${payload.priority}`,
    `Payout setup owner: ${payload.payoutAdminName}`,
    `Payout setup email: ${payload.payoutAdminEmail}`,
    `Stripe Connect readiness: ${payload.payoutReadiness}`,
    `Page URL: ${payload.pageUrl || ""}`,
    `Notification ID: ${notificationId}`,
    "",
    "Launch notes:",
    payload.notes || "None provided.",
  ];

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: recipients.map((email) => ({ email })) }],
      from: { email: from, name: "The Bee Suite" },
      subject: `New Bee Suite onboarding intake - ${payload.brandName}`,
      content: [{ type: "text/plain", value: lines.join("\n") }],
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    return { ok: false, skipped: false, recipients: recipients.length, error: `SendGrid returned ${response.status}.` };
  }

  return { ok: true, skipped: false, recipients: recipients.length };
}

export async function POST(request: NextRequest) {
  const payload = normalizePayload((await request.json().catch(() => ({}))) as OnboardingPayload);
  const errors = validate(payload);

  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const tenant = await prisma.tenant.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!tenant) {
    return NextResponse.json({ ok: false, error: "The Bee Suite tenant is not initialized yet." }, { status: 503 });
  }

  const notification = await prisma.notification.create({
    data: {
      title: `New onboarding intake: ${payload.brandName}`,
      body: `${payload.centerCount} center(s), priority ${payload.priority}, payout owner ${payload.payoutAdminEmail}.`,
      type: "Onboarding",
      priority: "high",
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: "onboarding.intake.submitted",
      resource: "OnboardingSubmission",
      resourceId: notification.id,
      metadata: {
        ...payload,
        notificationId: notification.id,
        submittedAt: new Date().toISOString(),
      },
    },
  });

  const email = await sendOnboardingEmail(payload, notification.id).catch((error) => ({
    ok: false,
    skipped: false,
    recipients: getNotificationRecipients().length,
    error: error instanceof Error ? error.message : "Onboarding notification email failed.",
  }));

  return NextResponse.json({
    ok: true,
    notificationId: notification.id,
    integrations: { email },
  });
}
