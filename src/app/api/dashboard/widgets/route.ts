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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function recordFromJson(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

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

export async function GET() {
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

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const preferenceUser = await getPreferenceUser(user.id, user.tenantId);
  if (!preferenceUser) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const customFields = recordFromJson(preferenceUser.customFields);
  const nextCustomFields = { ...customFields };
  const reset = body.reset === true;
  const dashboardWidgets = normalizeDashboardWidgetPreferences({
    role: user.role,
    value: reset ? undefined : body,
  });

  if (reset) {
    delete nextCustomFields[dashboardWidgetPreferencesKey];
  } else {
    nextCustomFields[dashboardWidgetPreferencesKey] = dashboardWidgetPreferencesForStorage(dashboardWidgets, {
      updatedAt: new Date().toISOString(),
      updatedByUserId: user.id,
      updatedByEmail: user.email,
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      customFields: nextCustomFields as Prisma.InputJsonValue,
    },
  });

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
