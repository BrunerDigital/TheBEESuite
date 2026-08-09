import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { AI_COMMAND_GUARDRAIL_NOTE, buildAiOperationsSummary } from "@/lib/ai-command";
import {
  AI_COMMAND_MODEL,
  AI_COMMAND_MAX_BULK_RECORDS,
  AI_COMMAND_MUTATION_BOUNDARY,
  aiCommandRecordIds,
  aiCommandMutationRoles,
  childAiFields,
  cleanAiPatch,
  enrollmentAiFields,
  familyAiFields,
  guardianAiFields,
  invoiceAiFields,
  schoolAiFields,
  tuitionAiFields,
} from "@/lib/ai-command-mutations";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import { buildBulkEnrollmentChange } from "@/lib/child-enrollment-bulk";
import { defaultRecurringBillingPeriod, WEEKLY_TUITION_AUTOBILL_CADENCE, WEEKLY_TUITION_AUTOBILL_DAY } from "@/lib/billing-workflows";
import { centerServiceDayWindow, latestLogMap } from "@/lib/attendance-state";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { readStaffClockState } from "@/lib/staff-kiosk";

export const runtime = "nodejs";

const suggestionStatuses = new Set(["pending_review", "approved", "rejected", "archived"]);

type OpenAiOutputItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type OpenAiResponse = {
  output?: OpenAiOutputItem[];
  error?: { message?: string };
};

type AiPlannedCall = { name: string; arguments: string };

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
    select: { id: true, name: true, crmLocationId: true, city: true, state: true, postalCode: true, timezone: true, customFields: true },
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
  const serviceDay = centerServiceDayWindow(now, selectedCenters.length === 1 ? selectedCenters[0] : null);
  const scopeLabel = selectedCenters.length === 1 ? centerLabel(selectedCenters[0]) : `${selectedCenters.length.toLocaleString()} visible schools`;
  const scope = selectedCenters.length === 1 ? "center" : "center_group";
  const scopeId = selectedCenters.length === 1 ? selectedCenters[0].id : null;
  const currentFamilyWhere: Prisma.FamilyWhereInput = {
    centerId: selectedCenterFilter,
    children: { some: currentlyEnrolledChildWhere() },
  };

  const openInvoiceWhere: Prisma.InvoiceWhereInput = {
    billingAccount: { family: currentFamilyWhere },
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
    prisma.tour.count({ where: { centerId: selectedCenterFilter, startsAt: { gte: serviceDay.start, lt: serviceDay.end } } }),
    prisma.child.count({
      where: {
        ...currentlyEnrolledChildWhere(),
        family: { centerId: selectedCenterFilter },
      },
    }),
    prisma.checkInOutLog.findMany({
      where: { centerId: selectedCenterFilter, occurredAt: { gte: serviceDay.start, lt: serviceDay.end } },
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
        date: { gte: serviceDay.start, lt: serviceDay.end },
        sentAt: null,
        child: { family: { is: { centerId: selectedCenterFilter } } },
      },
    }),
  ]);

  const latestChecks = latestLogMap(checkLogs);
  const checkedInChildren = Array.from(latestChecks.values()).filter((log) => log.type === "check_in").length;
  const staffClockedIn = staffProfiles.filter((staff) => readStaffClockState(staff.customFields).status === "clocked_in").length;
  const { title, body: summaryBody } = buildAiOperationsSummary({
    timeZone: user.timeZone,
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
  const selectedSubject = clean(body.selectedSubject).slice(0, 240);
  const selectedBody = clean(body.selectedBody).slice(0, 8_000);
  const destination = clean(body.destination).slice(0, 80);
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
    data: {
      status,
      promptContext: {
        ...asRecord(existing.promptContext),
        review: {
          status,
          reviewedAt: new Date().toISOString(),
          reviewedByUserId: user.id,
          reviewedByName: user.name,
          destination: destination || null,
          selectedSubject: selectedSubject || null,
          selectedBody: selectedBody || null,
        },
      },
    },
    select: { id: true, type: true, promptContext: true, suggestion: true, status: true, guardrailNote: true, createdAt: true },
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
      destination: destination || "review_queue",
      selectedDraftRecorded: Boolean(selectedBody),
    },
  });

  return NextResponse.json({ ok: true, suggestion });
}

function nullableString(value: unknown) {
  const next = clean(value);
  return next || null;
}

function parsedDate(value: unknown, field: string) {
  if (value === null || value === "") return null;
  const date = new Date(clean(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}

async function applyAiProfileChange(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  selectedCenterId: string,
  operationId: string,
  name: string,
  rawArguments: string,
) {
  const args = JSON.parse(rawArguments || "{}") as Record<string, unknown>;
  const recordId = clean(args.recordId);
  const patch = asRecord(args.patch);
  if (!recordId) throw new Error("The AI action did not identify a record.");

  if (["create_family_invoice", "update_open_invoice", "set_weekly_tuition"].includes(name) && !canManageBilling(user)) {
    throw new Error("Your role cannot manage billing records.");
  }

  if (name === "set_weekly_tuition") {
    const child = await prisma.child.findFirst({
      where: { id: recordId, family: { centerId: selectedCenterId } },
      select: { id: true, familyId: true, fullName: true, ageGroup: true, customFields: true },
    });
    if (!child) throw new Error("Child not found in the selected school.");
    const values = cleanAiPatch(patch, tuitionAiFields);
    const existingFields = asRecord(child.customFields);
    const enabled = values.enabled !== false;
    if (!enabled) {
      await prisma.child.update({
        where: { id: child.id },
        data: { customFields: { ...existingFields, tuitionBillingEnabled: false, tuitionBillingUpdatedAt: new Date().toISOString(), tuitionBillingUpdatedBy: user.email } as Prisma.InputJsonObject },
      });
    } else {
      const requestedPlanId = clean(values.tuitionPlanId);
      const requestedAmountCents = Number(values.amountCents);
      let plan = requestedPlanId
        ? await prisma.tuitionPlan.findFirst({ where: { id: requestedPlanId, centerId: selectedCenterId } })
        : null;
      if (!plan) {
        if (!Number.isInteger(requestedAmountCents) || requestedAmountCents < 0) throw new Error("Weekly tuition must be a non-negative whole number of cents or reference a school tuition plan.");
        plan = await prisma.tuitionPlan.findFirst({
          where: { centerId: selectedCenterId, amountCents: requestedAmountCents, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, ageGroup: child.ageGroup },
          orderBy: { name: "asc" },
        });
        if (!plan) {
          plan = await prisma.tuitionPlan.create({
            data: { centerId: selectedCenterId, name: `Weekly tuition - $${(requestedAmountCents / 100).toFixed(2)}`, ageGroup: child.ageGroup, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: requestedAmountCents },
          });
        }
      }
      const creditsTotal = Number(existingFields.tuitionCreditsTotalCents) || 0;
      if (plan.amountCents > 0 && creditsTotal >= plan.amountCents) throw new Error("Existing weekly credits must be less than the new gross tuition rate.");
      const startPeriod = defaultRecurringBillingPeriod(values.billingStartPeriod, new Date(), WEEKLY_TUITION_AUTOBILL_CADENCE);
      const updatedAt = new Date().toISOString();
      await prisma.$transaction(async (tx) => {
        await tx.child.update({
          where: { id: child.id },
          data: {
            customFields: {
              ...existingFields,
              tuitionBillingEnabled: true,
              tuitionPlanId: plan.id,
              tuitionPlanName: plan.name,
              tuitionPlanAgeGroup: plan.ageGroup,
              tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
              tuitionBillingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
              tuitionPlanAmountCents: plan.amountCents,
              tuitionNetAmountCents: plan.amountCents - creditsTotal,
              tuitionFundingType: plan.amountCents === 0 ? "voucher" : "family",
              tuitionAutobillEligible: plan.amountCents > 0,
              tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
              tuitionBillingStartsPeriod: startPeriod,
              tuitionBillingDescription: clean(values.description) || plan.name,
              tuitionBillingUpdatedAt: updatedAt,
              tuitionBillingUpdatedBy: user.email,
            } as Prisma.InputJsonObject,
          },
        });
        const account = await tx.billingAccount.findUnique({ where: { familyId: child.familyId }, select: { customFields: true } });
        const accountFields = asRecord(account?.customFields);
        await tx.billingAccount.upsert({
          where: { familyId: child.familyId },
          update: { customFields: { ...accountFields, tuitionAutobillEnabled: plan.amountCents > 0, tuitionAutobillCadence: WEEKLY_TUITION_AUTOBILL_CADENCE, tuitionAutobillBillingDay: WEEKLY_TUITION_AUTOBILL_DAY, tuitionAutobillStartsPeriod: startPeriod, tuitionAutobillPlanId: plan.id, tuitionAutobillPlanName: plan.name, tuitionAutobillAmountCents: plan.amountCents, tuitionAutobillUpdatedAt: updatedAt, tuitionAutobillUpdatedBy: user.email } as Prisma.InputJsonObject },
          create: { familyId: child.familyId, balanceCents: 0, autopayPlaceholder: false, customFields: { tuitionAutobillEnabled: plan.amountCents > 0, tuitionAutobillCadence: WEEKLY_TUITION_AUTOBILL_CADENCE, tuitionAutobillBillingDay: WEEKLY_TUITION_AUTOBILL_DAY, tuitionAutobillStartsPeriod: startPeriod, tuitionAutobillPlanId: plan.id, tuitionAutobillPlanName: plan.name, tuitionAutobillAmountCents: plan.amountCents, tuitionAutobillUpdatedAt: updatedAt, tuitionAutobillUpdatedBy: user.email } as Prisma.InputJsonObject },
        });
      });
    }
  } else if (name === "create_family_invoice") {
    const family = await prisma.family.findFirst({ where: { id: recordId, centerId: selectedCenterId } });
    if (!family) throw new Error("Family not found in the selected school.");
    const values = cleanAiPatch(patch, invoiceAiFields);
    const amountCents = Number(values.amountCents);
    const description = clean(values.description);
    const dueDate = parsedDate(values.dueDate, "Due date");
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Invoice amount must be a positive whole number of cents.");
    if (!description) throw new Error("Invoice description is required.");
    if (!dueDate) throw new Error("Invoice due date is required.");
    const created = await prisma.$transaction((tx) => createBillingInvoiceForFamily(tx, {
      familyId: family.id,
      dueDate,
      description,
      items: [{ description, amountCents }],
      customFields: {
        mode: "ai_director",
        centerId: selectedCenterId,
        createdByUserId: user.id,
        dedupeKey: `ai-command:${user.id}:${operationId}:invoice:${family.id}`,
      },
    }));
    args.recordId = created.invoice.id;
  } else if (name === "update_open_invoice") {
    const invoice = await prisma.invoice.findFirst({
      where: { id: recordId, billingAccount: { family: { centerId: selectedCenterId } } },
      include: { billingAccount: true, items: { orderBy: { id: "asc" } } },
    });
    if (!invoice) throw new Error("Invoice not found in the selected school.");
    if (invoice.status !== PaymentStatus.OPEN) throw new Error("Only open invoices can be edited.");
    const values = cleanAiPatch(patch, invoiceAiFields);
    const totalCents = "amountCents" in values ? Number(values.amountCents) : invoice.totalCents;
    if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("Invoice amount must be a positive whole number of cents.");
    const dueDate = "dueDate" in values ? parsedDate(values.dueDate, "Due date") : invoice.dueDate;
    if (!dueDate) throw new Error("Invoice due date is required.");
    const description = "description" in values ? clean(values.description) : invoice.items[0]?.description || invoice.number;
    if (!description) throw new Error("Invoice description is required.");
    const amountDeltaCents = totalCents - invoice.totalCents;
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoice.id }, data: { totalCents, dueDate } });
      const primaryItem = invoice.items[0];
      if (primaryItem) {
        await tx.invoiceItem.update({ where: { id: primaryItem.id }, data: { amountCents: totalCents, description } });
        if (invoice.items.length > 1) await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id, id: { not: primaryItem.id } } });
      } else {
        await tx.invoiceItem.create({ data: { invoiceId: invoice.id, amountCents: totalCents, description } });
      }
      if (amountDeltaCents) {
        const account = await tx.billingAccount.update({ where: { id: invoice.billingAccountId }, data: { balanceCents: { increment: amountDeltaCents } } });
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: invoice.billingAccountId,
            invoiceId: invoice.id,
            type: "invoice_adjustment",
            description: `AI director invoice correction for ${invoice.number}`,
            amountCents: amountDeltaCents,
            balanceAfterCents: account.balanceCents,
            sourceSystem: "bee_suite_ai_director",
            externalId: `ai-invoice-edit:${invoice.id}:${Date.now()}`,
            metadata: { previousTotalCents: invoice.totalCents, updatedTotalCents: totalCents, editedByUserId: user.id, centerId: selectedCenterId },
          },
        });
      }
    });
  } else if (name === "update_child_enrollment") {
    const child = await prisma.child.findFirst({ where: { id: recordId, family: { centerId: selectedCenterId } } });
    if (!child) throw new Error("Child not found in the selected school.");
    const values = cleanAiPatch(patch, enrollmentAiFields);
    const change = buildBulkEnrollmentChange({ childIds: [child.id], enrollmentStatus: values.enrollmentStatus, classroomId: values.classroomId });
    if (!change.ok) throw new Error(change.error);
    if (change.value.classroomId) {
      const classroom = await prisma.classroom.findFirst({ where: { id: change.value.classroomId, centerId: selectedCenterId } });
      if (!classroom) throw new Error("Classroom not found in the selected school.");
    }
    await prisma.child.update({ where: { id: child.id }, data: { enrollmentStatus: change.value.enrollmentStatus, classroomId: change.value.classroomId } });
  } else if (name === "update_family_profile") {
    const current = await prisma.family.findFirst({ where: { id: recordId, centerId: selectedCenterId } });
    if (!current) throw new Error("Family not found in the selected school.");
    const values = cleanAiPatch(patch, familyAiFields);
    const data: Prisma.FamilyUpdateInput = {};
    if ("name" in values) data.name = clean(values.name) || current.name;
    if ("address" in values) data.address = nullableString(values.address);
    if ("billingEmail" in values) data.billingEmail = nullableString(values.billingEmail);
    if ("notes" in values) data.notes = nullableString(values.notes);
    if (!Object.keys(data).length) throw new Error("No allowed family fields were provided.");
    await prisma.family.update({ where: { id: current.id }, data });
  } else if (name === "update_guardian_profile") {
    const current = await prisma.guardian.findFirst({ where: { id: recordId, family: { centerId: selectedCenterId } } });
    if (!current) throw new Error("Guardian not found in the selected school.");
    const values = cleanAiPatch(patch, guardianAiFields);
    const data: Prisma.GuardianUpdateInput = {};
    for (const field of ["email", "phone", "employer", "preferredCommunication"] as const) {
      if (field in values) data[field] = nullableString(values[field]);
    }
    if ("fullName" in values) data.fullName = clean(values.fullName) || current.fullName;
    if ("relation" in values) data.relation = clean(values.relation) || current.relation;
    if ("isBillingContact" in values) data.isBillingContact = values.isBillingContact === true;
    if (!Object.keys(data).length) throw new Error("No allowed guardian fields were provided.");
    await prisma.guardian.update({ where: { id: current.id }, data });
  } else if (name === "update_child_profile") {
    const current = await prisma.child.findFirst({ where: { id: recordId, family: { centerId: selectedCenterId } } });
    if (!current) throw new Error("Child not found in the selected school.");
    const values = cleanAiPatch(patch, childAiFields);
    const data: Prisma.ChildUpdateInput = {};
    for (const field of ["preferredName", "napNotes", "feedingNotes", "pottyNotes", "developmentalNotes"] as const) {
      if (field in values) data[field] = nullableString(values[field]);
    }
    if ("fullName" in values) data.fullName = clean(values.fullName) || current.fullName;
    if ("ageGroup" in values) data.ageGroup = clean(values.ageGroup) || current.ageGroup;
    if ("dateOfBirth" in values) data.dateOfBirth = parsedDate(values.dateOfBirth, "Date of birth") ?? current.dateOfBirth;
    if ("startDate" in values) data.startDate = parsedDate(values.startDate, "Start date");
    if ("photoVideoPermission" in values) data.photoVideoPermission = values.photoVideoPermission === true;
    if ("fieldTripPermission" in values) data.fieldTripPermission = values.fieldTripPermission === true;
    if (!Object.keys(data).length) throw new Error("No allowed child fields were provided.");
    await prisma.child.update({ where: { id: current.id }, data });
  } else if (name === "update_school_profile") {
    const current = await prisma.center.findFirst({ where: { id: recordId === selectedCenterId ? recordId : "__outside_selected_school__", organization: { tenantId: user.tenantId } } });
    if (!current) throw new Error("School not found in the selected location scope.");
    const values = cleanAiPatch(patch, schoolAiFields);
    const data: Prisma.CenterUpdateInput = {};
    for (const field of ["address", "city", "state", "postalCode", "phone", "email"] as const) {
      if (field in values) data[field] = nullableString(values[field]);
    }
    if ("timezone" in values) data.timezone = clean(values.timezone) || current.timezone;
    if ("licensedCapacity" in values) {
      const capacity = Number(values.licensedCapacity);
      if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10_000) throw new Error("Licensed capacity must be a whole number from 0 to 10000.");
      data.licensedCapacity = capacity;
    }
    if (!Object.keys(data).length) throw new Error("No allowed school fields were provided.");
    await prisma.center.update({ where: { id: current.id }, data });
  } else {
    throw new Error("The model requested an unsupported action.");
  }

  await writeAuditLog(user, {
    centerId: selectedCenterId,
    action: `ai_command.${name}`,
    resource: name.replace("update_", "").replaceAll("_", " "),
    resourceId: clean(args.recordId) || recordId,
    metadata: { model: AI_COMMAND_MODEL, changedFields: Object.keys(cleanAiPatch(patch, [...familyAiFields, ...guardianAiFields, ...childAiFields, ...schoolAiFields, ...invoiceAiFields, ...enrollmentAiFields, ...tuitionAiFields])) },
  });
  return { action: name, recordId: clean(args.recordId) || recordId, changedFields: Object.keys(patch) };
}

const profileTools = [
  { name: "update_family_profile", description: "Update ordinary family profile fields for a family in the selected school.", fields: familyAiFields },
  { name: "update_guardian_profile", description: "Update ordinary guardian contact/profile fields in the selected school.", fields: guardianAiFields },
  { name: "update_child_profile", description: "Update ordinary child profile fields, but never enrollment status, custody, medical, or billing data.", fields: childAiFields },
  { name: "update_school_profile", description: "Update ordinary contact/location fields for the selected school.", fields: schoolAiFields },
  { name: "create_family_invoice", description: "Create an open invoice without submitting a payment. recordId must be the family ID. Amount is in cents.", fields: invoiceAiFields },
  { name: "update_open_invoice", description: "Edit the amount, due date, or description of an open invoice and reconcile the family ledger. recordId must be the invoice ID.", fields: invoiceAiFields },
  { name: "update_child_enrollment", description: "Change a child's enrollment status and classroom using the same rules as the director dashboard. recordId must be the child ID.", fields: enrollmentAiFields },
  { name: "set_weekly_tuition", description: "Set, change, or disable a child's recurring weekly tuition assignment without creating an invoice or submitting payment. Use child IDs. Amount is gross weekly tuition in cents.", fields: tuitionAiFields },
].map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  strict: false,
  parameters: {
    type: "object",
    properties: {
      recordId: { type: "string", description: "Use an exact record ID from the supplied selected-school context." },
      recordIds: { type: "array", items: { type: "string" }, maxItems: AI_COMMAND_MAX_BULK_RECORDS, description: "For a confirmed bulk change, use exact record IDs from the selected-school context." },
      patch: {
        type: "object",
        properties: Object.fromEntries(tool.fields.map((field) => [field, ["isBillingContact", "photoVideoPermission", "fieldTripPermission"].includes(field)
          || field === "enabled" ? { type: "boolean" }
          : ["licensedCapacity", "amountCents"].includes(field) ? { type: "integer" } : { type: ["string", "null"] }])),
        additionalProperties: false,
      },
    },
    required: ["patch"],
    additionalProperties: false,
  },
}));

async function runAiDataCommand(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  body: Record<string, unknown>,
) {
  if (!aiCommandMutationRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Your role cannot make AI-assisted profile changes." }, { status: 403 });
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ ok: false, error: "The OpenAI API key is not configured." }, { status: 503 });
  const command = clean(body.command).slice(0, 4_000);
  const operationId = clean(body.operationId).slice(0, 120);
  const selectedCenterId = clean(body.centerId);
  if (!command) return NextResponse.json({ ok: false, error: "Enter a command for Mr. Bee." }, { status: 400 });
  if (!operationId) return NextResponse.json({ ok: false, error: "AI command operation ID is required." }, { status: 400 });
  if (!selectedCenterId || selectedCenterId === "all") {
    return NextResponse.json({ ok: false, error: "Choose one school before asking AI to change data." }, { status: 400 });
  }
  if (!canAccessCenter(user, selectedCenterId)) {
    return NextResponse.json({ ok: false, error: "The selected school is outside your access scope." }, { status: 403 });
  }

  const center = await prisma.center.findFirst({
    where: { id: selectedCenterId, organization: { tenantId: user.tenantId } },
    select: { id: true, name: true, address: true, city: true, state: true, postalCode: true, phone: true, email: true, timezone: true, licensedCapacity: true },
  });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  const families = await prisma.family.findMany({
    where: { centerId: selectedCenterId },
    orderBy: { name: "asc" },
    take: 250,
    select: {
      id: true, name: true, address: true, billingEmail: true,
      guardians: { select: { id: true, fullName: true, email: true, phone: true, relation: true } },
      children: { select: { id: true, fullName: true, preferredName: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true } },
    },
  });
  const [classrooms, invoices, tuitionPlans] = await Promise.all([
    prisma.classroom.findMany({
      where: { centerId: selectedCenterId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, ageGroup: true },
    }),
    prisma.invoice.findMany({
      where: { status: PaymentStatus.OPEN, billingAccount: { family: { centerId: selectedCenterId } } },
      orderBy: { dueDate: "asc" },
      take: 250,
      select: {
        id: true, number: true, status: true, dueDate: true, totalCents: true,
        items: { orderBy: { id: "asc" }, take: 1, select: { description: true } },
        billingAccount: { select: { family: { select: { id: true, name: true } } } },
      },
    }),
    prisma.tuitionPlan.findMany({ where: { centerId: selectedCenterId }, orderBy: { name: "asc" }, select: { id: true, name: true, ageGroup: true, cadence: true, amountCents: true } }),
  ]);

  const recordLabels = new Map<string, string>([[center.id, center.name]]);
  for (const family of families) {
    recordLabels.set(family.id, family.name);
    for (const guardian of family.guardians) recordLabels.set(guardian.id, `${guardian.fullName} · ${family.name}`);
    for (const child of family.children) recordLabels.set(child.id, `${child.fullName} · ${family.name}`);
  }
  for (const invoice of invoices) recordLabels.set(invoice.id, `${invoice.number} · ${invoice.billingAccount.family.name}`);
  const familiesForPrompt = families.map((family) => ({
    ...family,
    children: family.children.map((child) => {
      const fields = asRecord(child.customFields);
      return {
        id: child.id,
        fullName: child.fullName,
        preferredName: child.preferredName,
        ageGroup: child.ageGroup,
        enrollmentStatus: child.enrollmentStatus,
        classroomId: child.classroomId,
        weeklyTuition: {
          enabled: fields.tuitionBillingEnabled === true,
          tuitionPlanId: clean(fields.tuitionPlanId) || null,
          amountCents: typeof fields.tuitionPlanAmountCents === "number" ? fields.tuitionPlanAmountCents : null,
          startsPeriod: clean(fields.tuitionBillingStartsPeriod) || null,
        },
      };
    }),
  }));

  const input: unknown[] = [
    { role: "system", content: [{ type: "input_text", text: `You are Mr. Bee, a school operations assistant. ${AI_COMMAND_MUTATION_BOUNDARY} This is a planning pass only: use tools to stage the exact requested changes, but tell the director that nothing will change until they confirm the plan. For bulk requests, use recordIds and include only records that unambiguously match the request. Ask a concise question instead of staging when the target set, amount, effective period, or new value is ambiguous. Never invent a record ID or value. The server revalidates authorization and all targets at confirmation time.` }] },
    { role: "user", content: [{ type: "input_text", text: `Selected school data:\n${JSON.stringify({ center, families: familiesForPrompt, classrooms, openInvoices: invoices, tuitionPlans })}\n\nDirector command:\n${command}` }] },
  ];
  const plannedCalls: AiPlannedCall[] = [];
  let finalText = "";

  for (let turn = 0; turn < 4; turn += 1) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_COMMAND_MODEL, reasoning: { effort: "medium" }, text: { verbosity: "low" }, input, tools: profileTools, parallel_tool_calls: false, store: false }),
      signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json().catch(() => ({})) as OpenAiResponse;
    if (!response.ok) throw new Error(result.error?.message || "OpenAI could not complete this command.");
    const output = result.output ?? [];
    input.push(...output);
    const calls = output.filter((item) => item.type === "function_call" && item.name && item.call_id);
    finalText = output.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("\n").trim() || finalText;
    if (!calls.length) break;
    for (const call of calls) {
      try {
        const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        const recordIds = aiCommandRecordIds(args);
        if (!recordIds.length) throw new Error("At least one exact record is required.");
        if (recordIds.length > AI_COMMAND_MAX_BULK_RECORDS) throw new Error(`Bulk changes are limited to ${AI_COMMAND_MAX_BULK_RECORDS} records.`);
        plannedCalls.push({ name: call.name!, arguments: JSON.stringify({ ...args, recordId: undefined, recordIds }) });
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: true, staged: true, recordCount: recordIds.length, confirmationRequired: true }) });
      } catch (error) {
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Action failed." }) });
      }
    }
  }

  if (!plannedCalls.length) {
    return NextResponse.json({ ok: true, model: AI_COMMAND_MODEL, message: finalText || "No changes were staged.", changes: [], requiresConfirmation: false });
  }
  const totalTargets = plannedCalls.reduce((total, call) => total + aiCommandRecordIds(JSON.parse(call.arguments) as Record<string, unknown>).length, 0);
  if (totalTargets > AI_COMMAND_MAX_BULK_RECORDS) {
    return NextResponse.json({ ok: false, error: `A single confirmed command can change no more than ${AI_COMMAND_MAX_BULK_RECORDS} records.` }, { status: 400 });
  }
  const plan = plannedCalls.map((call) => {
    const args = JSON.parse(call.arguments) as Record<string, unknown>;
    const ids = aiCommandRecordIds(args);
    return {
      action: call.name,
      targets: ids.map((id) => ({ id, label: recordLabels.get(id) || "Selected school record" })),
      patch: asRecord(args.patch),
    };
  });
  const proposal = await prisma.aiSuggestion.create({
    data: {
      type: "ai_command_change_plan",
      status: "pending_review",
      guardrailNote: AI_COMMAND_MUTATION_BOUNDARY,
      suggestion: JSON.stringify(plan),
      promptContext: { centerId: selectedCenterId, createdByUserId: user.id, operationId, command, calls: plannedCalls, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
    },
  });
  await writeAuditLog(user, { centerId: selectedCenterId, action: "ai_command.change_plan.created", resource: "AiSuggestion", resourceId: proposal.id, metadata: { operationId, actionCount: plannedCalls.length, targetCount: totalTargets } });
  return NextResponse.json({ ok: true, model: AI_COMMAND_MODEL, message: finalText || `Review the ${totalTargets} proposed record change${totalTargets === 1 ? "" : "s"} below. Nothing has been changed yet.`, changes: [], requiresConfirmation: true, proposalId: proposal.id, plan });
}

async function preflightAiPlannedCall(selectedCenterId: string, call: AiPlannedCall) {
  const args = JSON.parse(call.arguments) as Record<string, unknown>;
  const ids = aiCommandRecordIds(args);
  if (!ids.length || ids.length > AI_COMMAND_MAX_BULK_RECORDS) throw new Error("The confirmed plan has an invalid target count.");
  let count = 0;
  if (["update_family_profile", "create_family_invoice"].includes(call.name)) {
    count = await prisma.family.count({ where: { id: { in: ids }, centerId: selectedCenterId } });
  } else if (call.name === "update_guardian_profile") {
    count = await prisma.guardian.count({ where: { id: { in: ids }, family: { centerId: selectedCenterId } } });
  } else if (["update_child_profile", "update_child_enrollment", "set_weekly_tuition"].includes(call.name)) {
    count = await prisma.child.count({ where: { id: { in: ids }, family: { centerId: selectedCenterId } } });
  } else if (call.name === "update_open_invoice") {
    count = await prisma.invoice.count({ where: { id: { in: ids }, status: PaymentStatus.OPEN, billingAccount: { family: { centerId: selectedCenterId } } } });
  } else if (call.name === "update_school_profile") {
    count = ids.length === 1 && ids[0] === selectedCenterId ? 1 : 0;
  } else {
    throw new Error("The confirmed plan contains an unsupported action.");
  }
  if (count !== ids.length) throw new Error("One or more planned records are no longer available in the selected school.");
}

async function resolveAiDataCommandPlan(
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  body: Record<string, unknown>,
) {
  const proposalId = clean(body.proposalId);
  const decision = clean(body.decision);
  if (!proposalId || !["confirm", "cancel"].includes(decision)) {
    return NextResponse.json({ ok: false, error: "Choose confirm or cancel for a valid AI change plan." }, { status: 400 });
  }
  const proposal = await prisma.aiSuggestion.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.type !== "ai_command_change_plan") return NextResponse.json({ ok: false, error: "AI change plan not found." }, { status: 404 });
  const context = asRecord(proposal.promptContext);
  const selectedCenterId = clean(context.centerId);
  if (clean(context.createdByUserId) !== user.id || !selectedCenterId || !canAccessCenter(user, selectedCenterId)) {
    return NextResponse.json({ ok: false, error: "You cannot approve this AI change plan." }, { status: 403 });
  }
  if (proposal.status !== "pending_review") return NextResponse.json({ ok: false, error: "This AI change plan is no longer awaiting confirmation." }, { status: 409 });
  const expiresAt = new Date(clean(context.expiresAt));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    await prisma.aiSuggestion.update({ where: { id: proposal.id }, data: { status: "archived" } });
    return NextResponse.json({ ok: false, error: "This AI change plan expired. Run the prompt again to review current data." }, { status: 409 });
  }
  if (decision === "cancel") {
    await prisma.aiSuggestion.update({ where: { id: proposal.id }, data: { status: "rejected" } });
    await writeAuditLog(user, { centerId: selectedCenterId, action: "ai_command.change_plan.cancelled", resource: "AiSuggestion", resourceId: proposal.id });
    return NextResponse.json({ ok: true, cancelled: true, message: "No changes were made." });
  }

  const calls = Array.isArray(context.calls)
    ? context.calls.map((value) => asRecord(value)).map((value) => ({ name: clean(value.name), arguments: clean(value.arguments) }))
    : [];
  if (!calls.length) return NextResponse.json({ ok: false, error: "This AI change plan has no actions." }, { status: 400 });
  const totalTargets = calls.reduce((total, call) => total + aiCommandRecordIds(JSON.parse(call.arguments || "{}") as Record<string, unknown>).length, 0);
  if (totalTargets > AI_COMMAND_MAX_BULK_RECORDS) return NextResponse.json({ ok: false, error: "This AI change plan exceeds the bulk-change limit." }, { status: 400 });
  for (const call of calls) await preflightAiPlannedCall(selectedCenterId, call);
  const claimed = await prisma.aiSuggestion.updateMany({ where: { id: proposal.id, status: "pending_review" }, data: { status: "approved" } });
  if (claimed.count !== 1) return NextResponse.json({ ok: false, error: "This AI change plan was already handled." }, { status: 409 });

  const changes: Array<{ action: string; recordId: string; changedFields: string[] }> = [];
  try {
    for (const call of calls) {
      const args = JSON.parse(call.arguments) as Record<string, unknown>;
      for (const recordId of aiCommandRecordIds(args)) {
        changes.push(await applyAiProfileChange(user, selectedCenterId, clean(context.operationId), call.name, JSON.stringify({ ...args, recordId, recordIds: undefined })));
      }
    }
  } catch (error) {
    await prisma.aiSuggestion.update({ where: { id: proposal.id }, data: { status: "failed" } });
    await writeAuditLog(user, { centerId: selectedCenterId, action: "ai_command.change_plan.failed", resource: "AiSuggestion", resourceId: proposal.id, metadata: { completedCount: changes.length, error: error instanceof Error ? error.message : "Action failed" } });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The confirmed change plan failed.", changes }, { status: 409 });
  }
  await writeAuditLog(user, { centerId: selectedCenterId, action: "ai_command.change_plan.completed", resource: "AiSuggestion", resourceId: proposal.id, metadata: { operationId: clean(context.operationId), changeCount: changes.length } });
  return NextResponse.json({ ok: true, message: `${changes.length} confirmed school-scoped change${changes.length === 1 ? "" : "s"} completed.`, changes });
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
  if (action === "run_data_command") return runAiDataCommand(user, body);
  if (action === "resolve_data_command_plan") return resolveAiDataCommandPlan(user, body);

  return NextResponse.json({
    ok: false,
    error: "Unsupported AI command action.",
    guardrailNote: AI_COMMAND_GUARDRAIL_NOTE,
  }, { status: 400 });
}

export const POST = withApiLogging("POST", POSTHandler);
