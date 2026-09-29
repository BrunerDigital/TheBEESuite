import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import {
  dashboardWidgetPreferencesForStorage,
  dashboardWidgetPreferencesKey,
  getDashboardWidgetPreferenceValue,
  normalizeDashboardWidgetPreferences,
} from "@/lib/dashboard-widgets";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getPreferenceUser(userId: string, tenantId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      customFields: true,
    },
  });
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const preferenceUser = await getPreferenceUser(user.id, user.tenantId);
  if (!preferenceUser) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const dashboardWidgets = normalizeDashboardWidgetPreferences({
    role: user.role,
    value: getDashboardWidgetPreferenceValue(preferenceUser.customFields),
  });

  return NextResponse.json({ ok: true, dashboardWidgets });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const reset = body.reset === true;
  const dashboardWidgets = normalizeDashboardWidgetPreferences({
    role: user.role,
    value: reset ? undefined : body,
  });

  // Patch only this preference in the current row. Replacing an earlier snapshot
  // could erase a sender block or a profile update that committed in between.
  const currentFields = Prisma.sql`CASE WHEN jsonb_typeof("customFields") = 'object' THEN "customFields" ELSE '{}'::jsonb END`;
  const nextFields = reset
    ? Prisma.sql`${currentFields} - ${dashboardWidgetPreferencesKey}::text`
    : Prisma.sql`jsonb_set(${currentFields}, ARRAY[${dashboardWidgetPreferencesKey}::text], ${JSON.stringify(dashboardWidgetPreferencesForStorage(dashboardWidgets, {
      updatedAt: new Date().toISOString(),
      updatedByUserId: user.id,
      updatedByEmail: user.email,
    }))}::jsonb, true)`;
  const saved = await prisma.$executeRaw`UPDATE "User" SET "customFields" = ${nextFields}, "updatedAt" = NOW() WHERE "id" = ${user.id} AND "tenantId" = ${user.tenantId} AND "isActive" = true`;
  if (saved !== 1) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

  await writeAuditLog(user, {
    action: reset ? "dashboard.widgets.reset" : "dashboard.widgets.updated",
    resource: "User",
    resourceId: user.id,
    metadata: {
      role: user.role,
      visibleWidgetIds: dashboardWidgets.visibleWidgetIds,
      hiddenWidgetIds: dashboardWidgets.hiddenWidgetIds,
      order: dashboardWidgets.order,
    },
  });

  return NextResponse.json({ ok: true, dashboardWidgets });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
