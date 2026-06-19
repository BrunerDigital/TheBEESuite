import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  normalizeTuitionPaymentReminderSettings,
  TUITION_PAYMENT_REMINDER_SETTINGS_KEY,
  tuitionPaymentReminderSettingsFromCustomFields,
} from "@/lib/tuition-payment-reminders";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

async function requireBillingSettingsAccess(centerId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }
  if (!canManageBilling(user)) {
    return { ok: false as const, status: 403, error: "Billing settings are not allowed for this role." };
  }
  if (!centerId) {
    return { ok: false as const, status: 400, error: "A school is required." };
  }
  if (!canAccessCenter(user, centerId)) {
    return { ok: false as const, status: 403, error: "You do not have access to this school." };
  }
  return { ok: true as const, user };
}

async function GETHandler(request: NextRequest) {
  const centerId = clean(request.nextUrl.searchParams.get("centerId"));
  const access = await requireBillingSettingsAccess(centerId);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, customFields: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    centerId: center.id,
    centerName: center.name,
    settings: tuitionPaymentReminderSettingsFromCustomFields(center.customFields),
  });
}

async function POSTHandler(request: NextRequest) {
  const body = jsonObject(await request.json().catch(() => ({})));
  const centerId = clean(body.centerId);
  const access = await requireBillingSettingsAccess(centerId);
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, customFields: true },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  }

  const settings = normalizeTuitionPaymentReminderSettings(body.settings);
  const existingFields = jsonObject(center.customFields);
  const updated = await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: {
        ...existingFields,
        [TUITION_PAYMENT_REMINDER_SETTINGS_KEY]: settings,
        tuitionPaymentReminderSettingsUpdatedAt: new Date().toISOString(),
        tuitionPaymentReminderSettingsUpdatedBy: access.user.email,
      } satisfies Prisma.InputJsonObject,
    },
    select: { id: true, name: true, customFields: true },
  });

  await writeAuditLog(access.user, {
    centerId: center.id,
    action: "billing.tuition_payment_reminder_settings.updated",
    resource: "Center",
    resourceId: center.id,
    metadata: { settings },
  });

  return NextResponse.json({
    ok: true,
    centerId: updated.id,
    centerName: updated.name,
    settings: tuitionPaymentReminderSettingsFromCustomFields(updated.customFields),
  });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
