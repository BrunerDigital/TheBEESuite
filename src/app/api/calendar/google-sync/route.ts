import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  getGoogleCalendarConfiguration,
  googleEventToCalendarData,
  listGoogleCalendarEvents,
  syncCalendarEventToGoogle,
  type GoogleCalendarSyncResult,
} from "@/lib/google-calendar-sync";
import { centerScopedAccessGuard } from "@/lib/operations-guardrails";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonObject;
}

function syncWindow() {
  const now = new Date();
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - 1);
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + 180);
  return { timeMin, timeMax };
}

async function recordCalendarDelivery({
  tenantId,
  centerId,
  eventId,
  result,
}: {
  tenantId: string;
  centerId: string | null;
  eventId: string;
  result: GoogleCalendarSyncResult;
}) {
  const delivered = result.ok;
  await prisma.integrationDelivery.create({
    data: {
      tenantId,
      centerId,
      provider: "google_calendar",
      providerMessageId: result.id ?? null,
      purpose: "calendar_sync",
      direction: "outbound",
      recipient: result.provider,
      status: delivered ? "delivered" : result.configured ? "failed" : "skipped",
      attempts: result.configured ? 1 : 0,
      maxAttempts: 3,
      payload: jsonSafe({ eventId, payload: result.payload ?? null }),
      lastResult: jsonSafe(result),
      lastError: result.error ?? null,
      deliveredAt: delivered ? new Date() : null,
    },
  });
}

async function upsertIntegrationStatus(tenantId: string, configured: boolean) {
  const existing = await prisma.integration.findFirst({
    where: { tenantId, provider: "google_calendar" },
    select: { id: true },
  });

  if (existing) {
    await prisma.integration.update({
      where: { id: existing.id },
      data: { status: configured ? "verified" : "needs_credentials", lastSyncAt: configured ? new Date() : undefined },
    });
    return;
  }

  await prisma.integration.create({
    data: {
      tenantId,
      provider: "google_calendar",
      status: configured ? "verified" : "needs_credentials",
      configPlaceholder: { setup: {}, storesTenantSecrets: true },
      lastSyncAt: configured ? new Date() : null,
    },
  });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Google Calendar sync is not allowed for this role." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const selectedCenterId = clean(body.centerId);
  const pullGoogleEvents = body.pullGoogleEvents !== false;

  const selectedCenter = selectedCenterId
    ? await prisma.center.findFirst({
        where: { id: selectedCenterId, organization: { tenantId: user.tenantId } },
        select: { id: true, name: true, crmLocationId: true, timezone: true },
      })
    : null;
  if (selectedCenterId && !selectedCenter) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }
  if (selectedCenter) {
    const accessGuard = centerScopedAccessGuard({
      centerId: selectedCenter.id,
      hasTenantWideAccess: canAccessAllCenters(user),
      hasCenterAccess: canAccessCenter(user, selectedCenter.id),
      resourceLabel: "Center",
    });
    if (!accessGuard.ok) {
      return NextResponse.json({ ok: false, error: accessGuard.error }, { status: accessGuard.status });
    }
  }

  const config = await getGoogleCalendarConfiguration(user.tenantId);
  if (!config.configured) {
    await upsertIntegrationStatus(user.tenantId, false);
    await writeAuditLog(user, {
      centerId: selectedCenter?.id ?? user.primaryCenterId,
      action: "calendar.google_sync.not_configured",
      resource: "Integration",
      metadata: { provider: "google_calendar", error: config.error ?? null },
    });
    return NextResponse.json({ ok: false, configured: false, provider: config.provider, error: config.error }, { status: 400 });
  }

  const { timeMin, timeMax } = syncWindow();
  const centerFilter: Prisma.CalendarEventWhereInput = selectedCenter
    ? { centerId: selectedCenter.id }
    : canAccessAllCenters(user)
      ? {}
      : { centerId: { in: user.centerIds } };
  const localEvents = await prisma.calendarEvent.findMany({
    where: {
      tenantId: user.tenantId,
      source: { not: "google" },
      startsAt: { lte: timeMax },
      OR: [
        { endsAt: { gte: timeMin } },
        { endsAt: null, startsAt: { gte: timeMin } },
        { recurrenceRule: { not: null } },
      ],
      ...centerFilter,
    },
    include: {
      center: { select: { id: true, name: true, crmLocationId: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 50,
  });

  let pushed = 0;
  let failed = 0;
  for (const event of localEvents) {
    const result = await syncCalendarEventToGoogle({
      event,
      centerName: event.center?.crmLocationId ?? event.center?.name ?? null,
      calendarId: config.calendarId,
      accessToken: config.accessToken,
    });
    if (result.ok) pushed += 1;
    else failed += 1;

    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        googleCalendarId: config.calendarId,
        googleEventId: result.id ?? event.googleEventId,
        googleSyncStatus: result.ok ? "synced" : "failed",
        googleSyncedAt: result.ok ? new Date() : event.googleSyncedAt,
        ...(result.payload ? { lastGooglePayload: jsonSafe(result.payload) } : {}),
      },
    });
    await recordCalendarDelivery({
      tenantId: user.tenantId,
      centerId: event.centerId,
      eventId: event.id,
      result,
    });
  }

  let imported = 0;
  let updated = 0;
  let importError: string | null = null;
  const importCenter = selectedCenter ?? (
    user.primaryCenterId
      ? await prisma.center.findFirst({
          where: { id: user.primaryCenterId, organization: { tenantId: user.tenantId } },
          select: { id: true, name: true, crmLocationId: true, timezone: true },
        })
      : null
  );

  if (pullGoogleEvents && importCenter) {
    const listed = await listGoogleCalendarEvents({
      calendarId: config.calendarId,
      accessToken: config.accessToken,
      timeMin,
      timeMax,
    });
    if (!listed.ok) {
      importError = listed.error ?? "Google Calendar events could not be imported.";
    } else {
      for (const googleEvent of listed.events) {
        const data = googleEventToCalendarData({
          event: googleEvent,
          tenantId: user.tenantId,
          centerId: importCenter.id,
          calendarId: config.calendarId,
          fallbackTimeZone: importCenter.timezone,
        });
        if (!data?.googleEventId) continue;

        const existing = await prisma.calendarEvent.findFirst({
          where: { tenantId: user.tenantId, googleCalendarId: config.calendarId, googleEventId: data.googleEventId },
          select: { id: true, source: true },
        });
        if (existing) {
          if (existing.source === "google") {
            await prisma.calendarEvent.update({
              where: { id: existing.id },
              data: {
                title: data.title,
                eventType: data.eventType,
                startsAt: data.startsAt,
                endsAt: data.endsAt,
                allDay: data.allDay,
                timeZone: data.timeZone,
                status: data.status,
                visibility: data.visibility,
                recurrenceRule: data.recurrenceRule,
                googleSyncStatus: "synced",
                googleSyncedAt: data.googleSyncedAt,
                lastGooglePayload: data.lastGooglePayload,
                notes: data.notes,
              },
            });
            updated += 1;
          }
          continue;
        }

        await prisma.calendarEvent.create({
          data: {
            ...data,
            createdById: user.id,
          },
        });
        imported += 1;
      }
    }
  }

  await upsertIntegrationStatus(user.tenantId, true);
  await writeAuditLog(user, {
    centerId: selectedCenter?.id ?? importCenter?.id ?? user.primaryCenterId,
    action: failed || importError ? "calendar.google_sync.partial" : "calendar.google_sync.completed",
    resource: "Integration",
    metadata: {
      provider: "google_calendar",
      calendarId: config.calendarId,
      pushed,
      failed,
      imported,
      updated,
      importError,
      windowStart: timeMin.toISOString(),
      windowEnd: timeMax.toISOString(),
    },
  });

  return NextResponse.json({
    ok: failed === 0 && !importError,
    configured: true,
    provider: config.provider,
    pushed,
    failed,
    imported,
    updated,
    importError,
    scanned: localEvents.length,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
