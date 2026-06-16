import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { AI_COMMAND_GUARDRAIL_NOTE, buildAiOperationsSummary } from "@/lib/ai-command";
import { latestLogMap, startOfServiceDay } from "@/lib/attendance-state";
import { currentlyEnrolledStatusValues } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { readStaffClockState } from "@/lib/staff-kiosk";

export const runtime = "nodejs";

const suggestionStatuses = new Set(["pending_review", "approved", "rejected", "archived"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function centerIdFilter(centerIds: string[]) {
  return centerIds.length ? { in: centerIds } : { in: ["__no_visible_centers__"] };
}

function centerWhereForUser(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): Prisma.CenterWhereInput {
  if (user.role === UserRole.PLATFORM_OWNER) return { status: { not: "closed" } };
  if (canAccessAllCenters(user)) {
    return { organization: { tenantId: user.tenantId }, status: { not: "closed" } };
  }
  return { id: centerIdFilter(user.centerIds), status: { not: "closed" } };
}

function centerLabel(center: { name: string; crmLocationId: string | null; city?: string | null; state?: string | null }) {
  return [
    center.crmLocationId ?? center.name,
    [center.city, center.state].filter(Boolean).join(", "),
  ].filter(Boolean).join(" - ");
}

function listFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const item = clean(value);
  return item ? [item] : [];
}

function centerIdsFromPromptContext(promptContext: Prisma.JsonValue | null) {
  const context = asRecord(promptContext);
  const segment = asRecord(context.segment);
  return Array.from(new Set([
    ...listFromUnknown(context.centerId),
    ...listFromUnknown(context.centerIds),
    ...listFromUnknown(segment.centerIds),
  ]));
}

async function resolveSuggestionAccess(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  promptContext: Prisma.JsonValue | null,
) {
  const context = asRecord(promptContext);
  const centerIds = new Set(centerIdsFromPromptContext(promptContext));
  const familyId = clean(context.familyId);
  const leadId = clean(context.leadId);

  if (familyId) {
    const family = await prisma.family.findUnique({ where: { id: familyId }, select: { centerId: true } });
    if (family?.centerId) centerIds.add(family.centerId);
  }

  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { centerId: true } });
    if (lead?.centerId) centerIds.add(lead.centerId);
  }

  if (!centerIds.size) return canAccessAllCenters(user);
  return Array.from(centerIds).every((centerId) => canAccessCenter(user, centerId));
}

async function generateOperationsSummary(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  body: Record<string, unknown>,
) {
  const requestedCenterId = clean(body.centerId);
  const visibleCenters = await prisma.center.findMany({
    where: centerWhereForUser(user),
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, crmLocationId: true, city: true, state: true, timezone: true },
  });

  let selectedCenters = visibleCenters;
  if (requestedCenterId && requestedCenterId !== "all") {
    selectedCenters = visibleCenters.filter((center) => center.id === requestedCenterId);
    if (!selectedCenters.length) {
      return NextResponse.json({ ok: false, error: "Selected school is outside your access scope." }, { status: 403 });
    }
  }

  if (!selectedCenters.length) {
    return NextResponse.json({ ok: false, error: "No visible schools are available for AI summaries." }, { status: 400 });
  }

  const centerIds = selectedCenters.map((center) => center.id);
  const selectedCenterFilter = centerIdFilter(centerIds);
  const now = new Date();
  const serviceDayStart = startOfServiceDay(now, selectedCenters.length === 1 ? selectedCenters[0].timezone : "America/New_York");
  const serviceDayEnd = new Date(serviceDayStart.getTime() + 24 * 60 * 60 * 1000);
  const scopeLabel = selectedCenters.length === 1 ? centerLabel(selectedCenters[0]) : `${selectedCenters.length.toLocaleString()} visible schools`;
  const scope = selectedCenters.length === 1 ? "center" : "center_group";
  const scopeId = selectedCenters.length === 1 ? selectedCenters[0].id : null;

  const openInvoiceWhere: Prisma.InvoiceWhereInput = {
    billingAccount: { family: { centerId: selectedCenterFilter } },
    status: { in: [PaymentStatus.OPEN, PaymentStatus.FAILED] },
  };
  const overdueInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...openInvoiceWhere,
    dueDate: { lt: now },
  };

  const [
    leadCount,
    highIntentLeadCount,
    toursToday,
    activeChildren,
    checkLogs,
    staffProfiles,
    openInvoices,
    overdueInvoices,
    overdueTotal,
    pendingIncidents,
    unreadMessages,
    unsentDailyReports,
  ] = await Promise.all([
    prisma.lead.count({ where: { centerId: selectedCenterFilter, status: { notIn: ["closed", "merged"] } } }),
    prisma.lead.count({ where: { centerId: selectedCenterFilter, status: { notIn: ["closed", "merged"] }, score: { gte: 75 } } }),
    prisma.tour.count({ where: { centerId: selectedCenterFilter, startsAt: { gte: serviceDayStart, lt: serviceDayEnd } } }),
    prisma.child.count({
      where: {
        family: { centerId: selectedCenterFilter },
        enrollmentStatus: { in: currentlyEnrolledStatusValues() },
      },
    }),
    prisma.checkInOutLog.findMany({
      where: { centerId: selectedCenterFilter, occurredAt: { gte: serviceDayStart, lt: serviceDayEnd } },
      orderBy: { occurredAt: "desc" },
      select: { childId: true, type: true, occurredAt: true },
    }),
    prisma.staffProfile.findMany({
      where: { centerId: selectedCenterFilter },
      select: { customFields: true },
    }),
    prisma.invoice.count({ where: openInvoiceWhere }),
    prisma.invoice.count({ where: overdueInvoiceWhere }),
    prisma.invoice.aggregate({ where: overdueInvoiceWhere, _sum: { totalCents: true } }),
    prisma.incidentReport.count({
      where: {
        adminReviewStatus: "pending",
        OR: [
          { classroom: { is: { centerId: selectedCenterFilter } } },
          { child: { family: { is: { centerId: selectedCenterFilter } } } },
        ],
      },
    }),
    prisma.message.count({ where: { readAt: null, family: { centerId: selectedCenterFilter } } }),
    prisma.dailyReport.count({
      where: {
        date: { gte: serviceDayStart, lt: serviceDayEnd },
        sentAt: null,
        child: { family: { is: { centerId: selectedCenterFilter } } },
      },
    }),
  ]);

  const latestChecks = latestLogMap(checkLogs);
  const checkedInChildren = Array.from(latestChecks.values()).filter((log) => log.type === "check_in").length;
  const staffClockedIn = staffProfiles.filter((staff) => readStaffClockState(staff.customFields).status === "clocked_in").length;
  const { title, body: summaryBody } = buildAiOperationsSummary({
    scopeLabel,
    generatedAt: now,
    leadCount,
    highIntentLeadCount,
    toursToday,
    activeChildren,
    checkedInChildren,
    staffClockedIn,
    openInvoices,
    overdueInvoices,
    overdueInvoiceCents: overdueTotal._sum.totalCents ?? 0,
    pendingIncidents,
    unreadMessages,
    unsentDailyReports,
  });

  const summary = await prisma.aiSummary.create({
    data: {
      scope,
      scopeId,
      title,
      body: summaryBody,
      requiresReview: true,
    },
  });

  await writeAuditLog(user, {
    centerId: scopeId,
    action: "ai_command.summary.generated",
    resource: "AiSummary",
    resourceId: summary.id,
    metadata: {
      scope,
      scopeId: scopeId ?? "",
      centerCount: centerIds.length,
      generatedBy: "ai_command_center",
    },
  });

  return NextResponse.json({ ok: true, summary });
}

async function updateSuggestionStatus(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  body: Record<string, unknown>,
) {
  const suggestionId = clean(body.suggestionId);
  const status = clean(body.status);
  if (!suggestionId) return NextResponse.json({ ok: false, error: "Suggestion ID is required." }, { status: 400 });
  if (!suggestionStatuses.has(status)) return NextResponse.json({ ok: false, error: "Unsupported suggestion status." }, { status: 400 });

  const existing = await prisma.aiSuggestion.findUnique({ where: { id: suggestionId } });
  if (!existing) return NextResponse.json({ ok: false, error: "Suggestion not found." }, { status: 404 });

  const canUpdate = await resolveSuggestionAccess(user, existing.promptContext);
  if (!canUpdate) {
    return NextResponse.json({ ok: false, error: "You do not have access to this suggestion." }, { status: 403 });
  }

  const suggestion = await prisma.aiSuggestion.update({
    where: { id: suggestionId },
    data: { status },
    select: { id: true, type: true, suggestion: true, status: true, guardrailNote: true, createdAt: true },
  });

  await writeAuditLog(user, {
    centerId: centerIdsFromPromptContext(existing.promptContext)[0] ?? null,
    action: "ai_command.suggestion.status_updated",
    resource: "AiSuggestion",
    resourceId: suggestion.id,
    metadata: {
      fromStatus: existing.status,
      toStatus: suggestion.status,
      suggestionType: suggestion.type,
    },
  });

  return NextResponse.json({ ok: true, suggestion });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "AI Command Center actions require school operations access." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action);

  if (action === "generate_summary") return generateOperationsSummary(user, body);
  if (action === "update_suggestion_status") return updateSuggestionStatus(user, body);

  return NextResponse.json({
    ok: false,
    error: "Unsupported AI command action.",
    guardrailNote: AI_COMMAND_GUARDRAIL_NOTE,
  }, { status: 400 });
}

export const POST = withApiLogging("POST", POSTHandler);
