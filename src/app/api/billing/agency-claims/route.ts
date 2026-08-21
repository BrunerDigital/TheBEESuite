import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import {
  agencyProgramSetupBlockers,
  agencyProgramStatus,
  claimAmountCents,
  claimSubmissionBlockers,
  nextRemittanceStatus,
  normalizeAgencyRequirements,
  normalizeStateCode,
  subsidyClaimNumber,
} from "@/lib/agency-subsidy-billing";
import { currentlyEnrolledStatusValues, isCurrentlyEnrolledChildRecord } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

const CURRENT_ENROLLMENT_STATUSES = currentlyEnrolledStatusValues();
const AUTHORIZATION_UNIT_TYPES = new Set(["weekly", "daily", "hourly", "monthly"]);
const REMITTANCE_METHODS = new Set(["ach", "check", "agency_portal", "other"]);
const UNIT_PRECISION = 1_000_000;
const CLAIM_PAGE_SIZE = 100;

class AgencyWorkflowError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type AgencySummaryRow = {
  claimedCents: bigint;
  approvedCents: bigint;
  paidCents: bigint;
  outstandingCents: bigint;
  needsSubmission: bigint;
  missingDocumentClaims: bigint;
};

function prismaConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code);
}

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
}

function cents(value: unknown) {
  const text = typeof value === "number" ? String(value) : clean(value).replace(/[$,]/g, "");
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return 0;
  const amount = Number(text) * 100;
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function validCurrencyInput(value: unknown, allowBlank = false) {
  const text = typeof value === "number" ? String(value) : clean(value).replace(/[$,]/g, "");
  return (allowBlank && !text) || /^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text);
}

function numberValue(value: unknown) {
  const text = typeof value === "number" ? String(value) : clean(value);
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return 0;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : 0;
}

function unitsAtPrecision(value: number) {
  return Math.round(value * UNIT_PRECISION);
}

function hasNumericInput(value: unknown) {
  return typeof value === "number" ? Number.isFinite(value) : Boolean(clean(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function csvRow(values: unknown[]) {
  return `${values.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")}\r\n`;
}

function exportClaimsCsv(centerIds: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvRow(["Claim", "Agency", "Family", "Child", "Service start", "Service end", "Status", "Claimed", "Approved", "Paid", "Missing documents"])));
        let cursorId: string | undefined;
        while (true) {
          const claims = await prisma.subsidyClaim.findMany({
            where: { centerId: { in: centerIds } },
            orderBy: { id: "asc" },
            take: 250,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            include: {
              agencyProgram: { select: { name: true } },
              authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
              documents: { orderBy: { name: "asc" } },
            },
          });
          if (!claims.length) break;
          const chunk = claims.map((claim) => csvRow([
            claim.number,
            claim.agencyProgram.name,
            claim.authorization?.family.name ?? "",
            claim.authorization?.child.fullName ?? "",
            dateInput(claim.servicePeriodStart),
            dateInput(claim.servicePeriodEnd),
            claim.status,
            (claim.claimedCents / 100).toFixed(2),
            claim.approvedCents === null ? "" : (claim.approvedCents / 100).toFixed(2),
            (claim.paidCents / 100).toFixed(2),
            claim.documents.filter((document) => !["received", "verified", "not_applicable"].includes(document.status)).map((document) => document.name).join("; "),
          ])).join("");
          controller.enqueue(encoder.encode(chunk));
          cursorId = claims.at(-1)?.id;
          if (claims.length < 250) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=agency-claims.csv",
      "Cache-Control": "private, no-store",
    },
  });
}

async function currentBillingUser(): Promise<
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  if (!canManageBilling(user)) return { ok: false, response: NextResponse.json({ ok: false, error: "Billing access required." }, { status: 403 }) };
  return { ok: true, user };
}

function centerAllowed(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, centerId: string) {
  return Boolean(centerId && canAccessCenter(user, centerId));
}

async function getHandler(request: NextRequest) {
  const auth = await currentBillingUser();
  if (!auth.ok) return auth.response;
  const requestedCenterId = clean(request.nextUrl.searchParams.get("centerId"));
  const exportingClaims = request.nextUrl.searchParams.get("exportClaims") === "true";
  const requestedClaimPage = Number.parseInt(clean(request.nextUrl.searchParams.get("claimPage")) || "1", 10);
  const claimPage = Math.min(Math.max(Number.isFinite(requestedClaimPage) ? requestedClaimPage : 1, 1), 10_000);
  const claimCursor = clean(request.nextUrl.searchParams.get("claimCursor"));
  const centerIds = requestedCenterId
    ? centerAllowed(auth.user, requestedCenterId) ? [requestedCenterId] : []
    : auth.user.centerIds;
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No accessible school selected." }, { status: 403 });
  if (exportingClaims) return exportClaimsCsv(centerIds);
  if (claimPage > 1 && !claimCursor) return NextResponse.json({ ok: false, error: "Refresh the claim queue before opening that page." }, { status: 400 });

  const [programs, authorizations, claims, summaryRows, families] = await Promise.all([
    prisma.agencyProgram.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ stateCode: "asc" }, { name: "asc" }],
    }),
    prisma.subsidyAuthorization.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ coverageEnd: "asc" }, { createdAt: "desc" }],
      include: {
        agencyProgram: { select: { name: true, programName: true } },
        family: { select: { name: true } },
        child: { select: { fullName: true, enrollmentStatus: true, classroomId: true } },
      },
    }),
    prisma.subsidyClaim.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ createdAt: "desc" }, { dueDate: "asc" }, { id: "desc" }],
      ...(claimCursor ? { cursor: { id: claimCursor }, skip: 1 } : {}),
      take: CLAIM_PAGE_SIZE + 1,
      include: {
        agencyProgram: { select: { name: true, programName: true, providerNumber: true, vendorNumber: true, submissionMethod: true, portalUrl: true, paymentInstructions: true } },
        authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
        lines: true,
        documents: { orderBy: { name: "asc" } },
        remittances: { orderBy: { paidAt: "desc" } },
      },
    }),
    prisma.$queryRaw<AgencySummaryRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM(claim."claimedCents"), 0)::bigint AS "claimedCents",
        COALESCE(SUM(COALESCE(claim."approvedCents", 0)), 0)::bigint AS "approvedCents",
        COALESCE(SUM(claim."paidCents"), 0)::bigint AS "paidCents",
        COALESCE(SUM(CASE
          WHEN claim.status IN ('submitted', 'approved', 'partially_paid')
          THEN GREATEST(COALESCE(claim."approvedCents", claim."claimedCents") - claim."paidCents", 0)
          ELSE 0
        END), 0)::bigint AS "outstandingCents",
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready'))::bigint AS "needsSubmission",
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready', 'submitted') AND EXISTS (
          SELECT 1 FROM "SubsidyClaimDocument" document
          WHERE document."claimId" = claim.id
            AND document.status NOT IN ('received', 'verified', 'not_applicable')
        ))::bigint AS "missingDocumentClaims"
      FROM "SubsidyClaim" claim
      WHERE claim."centerId" IN (${Prisma.join(centerIds)})
        AND claim.status <> 'void'
    `),
    prisma.family.findMany({
      where: { centerId: { in: centerIds }, children: { some: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] } } },
      orderBy: { name: "asc" },
      select: { id: true, centerId: true, name: true, children: { where: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] }, select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true }, orderBy: { fullName: "asc" } } },
    }),
  ]);

  const hasNextClaimPage = claims.length > CLAIM_PAGE_SIZE;
  const visibleClaims = claims.slice(0, CLAIM_PAGE_SIZE);
  const summaryRow = summaryRows[0];
  const summary = {
    claimedCents: Number(summaryRow?.claimedCents ?? 0),
    approvedCents: Number(summaryRow?.approvedCents ?? 0),
    paidCents: Number(summaryRow?.paidCents ?? 0),
    outstandingCents: Number(summaryRow?.outstandingCents ?? 0),
    needsSubmission: Number(summaryRow?.needsSubmission ?? 0),
    missingDocumentClaims: Number(summaryRow?.missingDocumentClaims ?? 0),
  };
  const programReadiness = programs.map((program) => {
    const setupBlockers = agencyProgramSetupBlockers(program);
    return { ...program, status: setupBlockers.length ? "setup_required" : "active", setupBlockers };
  });
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const expirationCutoff = new Date(today);
  expirationCutoff.setUTCDate(expirationCutoff.getUTCDate() + 31);
  const readiness = {
    readyPrograms: programReadiness.filter((program) => program.status === "active").length,
    setupRequiredPrograms: programReadiness.filter((program) => program.status !== "active").length,
    expiredAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd < today).length,
    expiringAuthorizations: authorizations.filter((authorization) => authorization.status === "active" && authorization.coverageEnd >= today && authorization.coverageEnd < expirationCutoff).length,
  };

  return NextResponse.json({
    ok: true,
    programs: programReadiness,
    authorizations,
    claims: visibleClaims,
    claimPagination: { page: claimPage, pageSize: CLAIM_PAGE_SIZE, hasNext: hasNextClaimPage, nextCursor: hasNextClaimPage ? visibleClaims.at(-1)?.id ?? null : null },
    families,
    summary: { ...summary, ...readiness },
  });
}

async function postHandler(request: NextRequest) {
  const auth = await currentBillingUser();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action);
  const centerId = clean(body.centerId);

  if (action === "createProgram") {
    if (!centerAllowed(auth.user, centerId)) return NextResponse.json({ ok: false, error: "School access denied." }, { status: 403 });
    const name = clean(body.name);
    const stateCode = normalizeStateCode(body.stateCode);
    if (!name || !stateCode) return NextResponse.json({ ok: false, error: "Agency name and two-letter state are required." }, { status: 400 });
    const requirements = normalizeAgencyRequirements(body.requirements);
    const setup = {
      providerNumber: clean(body.providerNumber) || null,
      vendorNumber: clean(body.vendorNumber) || null,
      submissionMethod: clean(body.submissionMethod) || "agency_portal",
      portalUrl: clean(body.portalUrl) || null,
      paymentInstructions: clean(body.paymentInstructions) || null,
    };
    const program = await prisma.agencyProgram.create({ data: {
      centerId, name, stateCode, programName: clean(body.programName) || null,
      ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
      requirements, status: agencyProgramStatus(setup),
    } });
    await writeAuditLog(auth.user, { centerId, action: "billing.agency_program.created", resource: "AgencyProgram", resourceId: program.id, metadata: { stateCode, name, requirementCount: requirements.length } });
    return NextResponse.json({ ok: true, program });
  }

  if (action === "updateProgram") {
    const program = await prisma.agencyProgram.findUnique({ where: { id: clean(body.agencyProgramId) } });
    if (!program || !centerAllowed(auth.user, program.centerId)) {
      return NextResponse.json({ ok: false, error: "Agency program not found." }, { status: 404 });
    }
    const name = clean(body.name);
    const stateCode = normalizeStateCode(body.stateCode);
    if (!name || !stateCode) return NextResponse.json({ ok: false, error: "Agency name and two-letter state are required." }, { status: 400 });
    const setup = {
      providerNumber: clean(body.providerNumber) || null,
      vendorNumber: clean(body.vendorNumber) || null,
      submissionMethod: clean(body.submissionMethod) || "agency_portal",
      portalUrl: clean(body.portalUrl) || null,
      paymentInstructions: clean(body.paymentInstructions) || null,
    };
    const requirements = body.requirements === undefined ? program.requirements : normalizeAgencyRequirements(body.requirements);
    const updated = await prisma.agencyProgram.update({ where: { id: program.id }, data: {
      name, stateCode, programName: clean(body.programName) || null,
      ...setup, remittanceEmail: clean(body.remittanceEmail) || null,
      requirements: requirements ?? undefined, status: agencyProgramStatus(setup),
    } });
    const blockers = agencyProgramSetupBlockers(updated);
    await writeAuditLog(auth.user, {
      centerId: program.centerId,
      action: "billing.agency_program.updated",
      resource: "AgencyProgram",
      resourceId: program.id,
      metadata: {
        status: updated.status,
        hasProviderOrVendorNumber: Boolean(updated.providerNumber || updated.vendorNumber),
        submissionMethod: updated.submissionMethod,
        hasPortalUrl: Boolean(updated.portalUrl),
        hasPaymentInstructions: Boolean(updated.paymentInstructions),
      },
    });
    return NextResponse.json({ ok: true, program: updated, blockers });
  }

  if (action === "createAuthorization") {
    const agencyProgramId = clean(body.agencyProgramId);
    const familyId = clean(body.familyId);
    const childId = clean(body.childId);
    const [program, family] = await Promise.all([
      prisma.agencyProgram.findUnique({ where: { id: agencyProgramId } }),
      prisma.family.findUnique({ where: { id: familyId }, include: { children: { select: { id: true, enrollmentStatus: true, classroomId: true } } } }),
    ]);
    const child = family?.children.find((item) => item.id === childId);
    if (!program || !family || program.centerId !== family.centerId || !centerAllowed(auth.user, program.centerId) || !child) {
      return NextResponse.json({ ok: false, error: "Agency, family, and child must belong to the same accessible school." }, { status: 403 });
    }
    if (!isCurrentlyEnrolledChildRecord(child)) {
      return NextResponse.json({ ok: false, error: "Only a currently enrolled child with an assigned classroom can receive a new agency authorization." }, { status: 409 });
    }
    const programBlockers = agencyProgramSetupBlockers(program);
    if (programBlockers.length) {
      return NextResponse.json({ ok: false, error: "Complete agency setup before adding child authorizations.", blockers: programBlockers }, { status: 409 });
    }
    const coverageStart = dateValue(body.coverageStart);
    const coverageEnd = dateValue(body.coverageEnd);
    const authorizationNumber = clean(body.authorizationNumber);
    const authorizedRateCents = cents(body.authorizedRateDollars);
    const familyCopayCents = cents(body.familyCopayDollars);
    const unitType = clean(body.unitType) || "weekly";
    const authorizedUnits = hasNumericInput(body.authorizedUnits) ? numberValue(body.authorizedUnits) : null;
    if (!coverageStart || !coverageEnd || coverageEnd < coverageStart || !authorizationNumber || authorizedRateCents <= 0) {
      return NextResponse.json({ ok: false, error: "Authorization number, valid coverage dates, and a positive agency rate are required." }, { status: 400 });
    }
    if (!validCurrencyInput(body.familyCopayDollars, true)) return NextResponse.json({ ok: false, error: "Enter the family copay as a valid dollar amount with no more than two decimal places." }, { status: 400 });
    if (familyCopayCents < 0) return NextResponse.json({ ok: false, error: "Family copay cannot be negative." }, { status: 400 });
    if (!AUTHORIZATION_UNIT_TYPES.has(unitType)) return NextResponse.json({ ok: false, error: "Choose a supported authorization rate unit." }, { status: 400 });
    if (authorizedUnits !== null && authorizedUnits <= 0) return NextResponse.json({ ok: false, error: "Authorized units must be greater than zero when provided." }, { status: 400 });
    let authorization;
    try {
      authorization = await prisma.subsidyAuthorization.create({ data: {
        centerId: program.centerId, agencyProgramId, familyId, childId, authorizationNumber,
        coverageStart, coverageEnd, authorizedRateCents, familyCopayCents,
        unitType, authorizedUnits,
        requiredDocuments: normalizeAgencyRequirements(body.requiredDocuments),
      } });
    } catch (error) {
      if (prismaConflict(error)) {
        return NextResponse.json({ ok: false, error: "This authorization already exists for the selected child. Use Edit authorization to correct its rate or dates." }, { status: 409 });
      }
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: program.centerId, action: "billing.subsidy_authorization.created", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { agencyProgramId, familyId, childId, coverageStart, coverageEnd } });
    return NextResponse.json({ ok: true, authorization });
  }

  if (action === "updateAuthorization") {
    const coverageStart = dateValue(body.coverageStart);
    const coverageEnd = dateValue(body.coverageEnd);
    const authorizationNumber = clean(body.authorizationNumber);
    const authorizedRateCents = cents(body.authorizedRateDollars);
    const familyCopayCents = cents(body.familyCopayDollars);
    const authorizedUnits = hasNumericInput(body.authorizedUnits) ? numberValue(body.authorizedUnits) : null;
    if (!coverageStart || !coverageEnd || coverageEnd < coverageStart || !authorizationNumber || authorizedRateCents <= 0) return NextResponse.json({ ok: false, error: "Authorization number, valid coverage dates, and a positive agency rate are required." }, { status: 400 });
    if (!validCurrencyInput(body.familyCopayDollars, true)) return NextResponse.json({ ok: false, error: "Enter the family copay as a valid dollar amount with no more than two decimal places." }, { status: 400 });
    if (familyCopayCents < 0) return NextResponse.json({ ok: false, error: "Family copay cannot be negative." }, { status: 400 });
    if (authorizedUnits !== null && authorizedUnits <= 0) return NextResponse.json({ ok: false, error: "Authorized units must be greater than zero when provided." }, { status: 400 });
    let correction;
    try {
      correction = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({
          where: { id: clean(body.authorizationId) },
          include: { claims: { where: { status: { not: "void" } }, select: { id: true }, take: 1 } },
        });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (authorization.claims.length) throw new AgencyWorkflowError("Void every draft claim tied to this authorization before correcting its rate or dates. Submitted and paid claim history cannot be rewritten.", 409);
        const unitType = clean(body.unitType) || authorization.unitType;
        if (!AUTHORIZATION_UNIT_TYPES.has(unitType)) throw new AgencyWorkflowError("Choose a supported authorization rate unit.");
        const updated = await tx.subsidyAuthorization.update({ where: { id: authorization.id }, data: { authorizationNumber, coverageStart, coverageEnd, authorizedRateCents, familyCopayCents, unitType, authorizedUnits } });
        return { authorization, updated, unitType };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ ok: false, error: "This authorization or its claims changed at the same time. Refresh before trying the correction again." }, { status: 409 });
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ ok: false, error: "Another authorization already uses that number for this child and agency." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: correction.authorization.centerId, action: "billing.subsidy_authorization.updated", resource: "SubsidyAuthorization", resourceId: correction.authorization.id, metadata: { previousRateCents: correction.authorization.authorizedRateCents, authorizedRateCents, previousCoverageStart: dateInput(correction.authorization.coverageStart), previousCoverageEnd: dateInput(correction.authorization.coverageEnd), coverageStart: dateInput(coverageStart), coverageEnd: dateInput(coverageEnd), unitType: correction.unitType, authorizedUnits } });
    return NextResponse.json({ ok: true, authorization: correction.updated });
  }

  if (action === "archiveAuthorization") {
    const authorization = await prisma.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) } });
    if (!authorization || !centerAllowed(auth.user, authorization.centerId)) return NextResponse.json({ ok: false, error: "Authorization not found." }, { status: 404 });
    const updated = await prisma.subsidyAuthorization.update({ where: { id: authorization.id }, data: { status: "inactive" } });
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.archived", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } });
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "restoreAuthorization") {
    const authorization = await prisma.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { enrollmentStatus: true, classroomId: true } } } });
    if (!authorization || !centerAllowed(auth.user, authorization.centerId)) return NextResponse.json({ ok: false, error: "Authorization not found." }, { status: 404 });
    if (!isCurrentlyEnrolledChildRecord(authorization.child)) return NextResponse.json({ ok: false, error: "Only an authorization for a currently enrolled child with an assigned classroom can be restored." }, { status: 409 });
    const programBlockers = agencyProgramSetupBlockers(authorization.agencyProgram);
    if (programBlockers.length) return NextResponse.json({ ok: false, error: "Complete agency setup before restoring this authorization.", blockers: programBlockers }, { status: 409 });
    const updated = await prisma.subsidyAuthorization.update({ where: { id: authorization.id }, data: { status: "active" } });
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.restored", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { previousStatus: authorization.status } });
    return NextResponse.json({ ok: true, authorization: updated });
  }

  if (action === "createClaim") {
    const start = dateValue(body.servicePeriodStart);
    const end = dateValue(body.servicePeriodEnd);
    const units = numberValue(body.serviceUnits);
    if (!start || !end || end < start || units <= 0) return NextResponse.json({ ok: false, error: "Valid service dates and positive service units are required." }, { status: 400 });
    let claim;
    try {
      claim = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { fullName: true, enrollmentStatus: true, classroomId: true } } } });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (authorization.status !== "active") throw new AgencyWorkflowError("Only an active authorization can be used for a new claim.", 409);
        if (!isCurrentlyEnrolledChildRecord(authorization.child)) throw new AgencyWorkflowError("Only an authorization for a currently enrolled child with an assigned classroom can be used for a new claim.", 409);
        const requestedRateCents = hasNumericInput(body.rateDollars) ? cents(body.rateDollars) : authorization.authorizedRateCents;
        if (requestedRateCents <= 0 || requestedRateCents > authorization.authorizedRateCents) throw new AgencyWorkflowError("The claim rate must be positive and cannot exceed the authorization rate.");
        const claimedCents = claimAmountCents({ serviceUnits: units, rateCents: requestedRateCents });
        if (start < authorization.coverageStart || end > authorization.coverageEnd || claimedCents <= 0) throw new AgencyWorkflowError("Service dates must fall within the authorization and units/rate must produce a positive claim.");
        const overlap = await tx.subsidyClaim.findFirst({ where: { authorizationId: authorization.id, status: { notIn: ["void", "denied"] }, servicePeriodStart: { lte: end }, servicePeriodEnd: { gte: start } }, select: { number: true } });
        if (overlap) throw new AgencyWorkflowError(`Claim ${overlap.number} already covers some or all of this service period. Void or correct that claim before creating another.`, 409);
        if (authorization.authorizedUnits !== null) {
          const used = await tx.subsidyClaimLine.aggregate({ where: { claim: { authorizationId: authorization.id, status: { notIn: ["void", "denied"] } } }, _sum: { serviceUnits: true } });
          if (unitsAtPrecision((used._sum.serviceUnits ?? 0) + units) > unitsAtPrecision(authorization.authorizedUnits)) throw new AgencyWorkflowError("This claim would exceed the authorization's total approved units.", 409);
        }
        const requirements = [...normalizeAgencyRequirements(authorization.agencyProgram.requirements), ...normalizeAgencyRequirements(authorization.requiredDocuments)]
          .filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
        return tx.subsidyClaim.create({ data: {
          centerId: authorization.centerId, agencyProgramId: authorization.agencyProgramId, authorizationId: authorization.id,
          number: subsidyClaimNumber({ stateCode: authorization.agencyProgram.stateCode, centerId: authorization.centerId, suffix: randomUUID() }),
          servicePeriodStart: start, servicePeriodEnd: end, dueDate: dateValue(body.dueDate), claimedCents, createdById: auth.user.id,
          lines: { create: [{ childId: authorization.childId, description: clean(body.description) || `${authorization.child.fullName} subsidy care`, serviceUnits: units, unitType: authorization.unitType, rateCents: requestedRateCents, amountCents: claimedCents, attendanceDays: numberValue(body.attendanceDays) || null }] },
          documents: { create: requirements.map((requirement) => ({ name: requirement.label, type: requirement.type })) },
        }, include: { lines: true, documents: true } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "Another claim was created for this authorization at the same time. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.created", resource: "SubsidyClaim", resourceId: claim.id, metadata: { authorizationId: claim.authorizationId, claimedCents: claim.claimedCents, servicePeriodStart: start, servicePeriodEnd: end } });
    return NextResponse.json({ ok: true, claim });
  }

  const claim = await prisma.subsidyClaim.findUnique({ where: { id: clean(body.claimId) }, include: { agencyProgram: true, documents: true } });
  if (!claim || !centerAllowed(auth.user, claim.centerId)) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  if (action === "updateDocument") {
    const status = clean(body.status);
    if (!new Set(["required", "requested", "received", "verified", "not_applicable"]).has(status)) return NextResponse.json({ ok: false, error: "Invalid document status." }, { status: 400 });
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: claim.id, status: { in: ["draft", "ready", "submitted"] } },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Documents cannot be changed after the agency decision is recorded.", 409);
        const document = await tx.subsidyClaimDocument.findFirst({ where: { id: clean(body.documentId), claimId: claim.id } });
        if (!document) throw new AgencyWorkflowError("Claim document not found.", 404);
        const linkedDocumentId = clean(body.linkedDocumentId) || document.documentId;
        const notes = clean(body.notes) || document.notes;
        if (status === "verified" && !linkedDocumentId && !notes) throw new AgencyWorkflowError("Add an evidence note or linked document before marking this item verified.");
        return tx.subsidyClaimDocument.update({ where: { id: document.id }, data: { status, documentId: linkedDocumentId, notes } });
      });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim_document.updated", resource: "SubsidyClaimDocument", resourceId: updated.id, metadata: { claimId: claim.id, status } });
    return NextResponse.json({ ok: true, document: updated });
  }

  if (action === "submitClaim") {
    if (claim.status !== "draft" && claim.status !== "ready") return NextResponse.json({ ok: false, error: "Only draft or ready claims can be submitted." }, { status: 409 });
    const blockers = claimSubmissionBlockers({ ...claim.agencyProgram, documents: claim.documents });
    if (blockers.length) return NextResponse.json({ ok: false, error: "Claim is not ready for submission.", blockers }, { status: 409 });
    const externalReference = clean(body.externalReference);
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the confirmation reference returned by the external agency channel." }, { status: 400 });
    const transition = await prisma.subsidyClaim.updateMany({ where: { id: claim.id, status: { in: ["draft", "ready"] } }, data: { status: "submitted", submittedAt: new Date(), externalReference } });
    if (transition.count !== 1) return NextResponse.json({ ok: false, error: "The claim changed before submission was recorded. Refresh before trying again." }, { status: 409 });
    const submitted = await prisma.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.marked_submitted", resource: "SubsidyClaim", resourceId: claim.id, metadata: { submissionMethod: claim.agencyProgram.submissionMethod, externalReference: submitted.externalReference } });
    return NextResponse.json({ ok: true, claim: submitted, externalSubmissionPerformed: false });
  }

  if (action === "recordDecision") {
    if (claim.status !== "submitted") return NextResponse.json({ ok: false, error: "Only a submitted claim can receive an agency decision." }, { status: 409 });
    const decision = clean(body.decision);
    if (decision !== "approved" && decision !== "denied") return NextResponse.json({ ok: false, error: "Decision must be approved or denied." }, { status: 400 });
    const approvedCents = decision === "approved" ? cents(body.approvedDollars) : 0;
    if (decision === "approved" && approvedCents <= 0) return NextResponse.json({ ok: false, error: "Approved amount must be greater than zero." }, { status: 400 });
    if (approvedCents > claim.claimedCents) return NextResponse.json({ ok: false, error: "Approved amount cannot exceed the claim." }, { status: 400 });
    const externalReference = clean(body.externalReference) || claim.externalReference;
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the agency decision or claim reference." }, { status: 400 });
    const denialReason = clean(body.denialReason);
    if (decision === "denied" && !denialReason) return NextResponse.json({ ok: false, error: "Enter the agency denial reason or code." }, { status: 400 });
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({ where: { id: claim.id, status: "submitted" }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The claim changed before the agency decision was recorded. Refresh before trying again.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { agencyProgram: true, documents: true } });
        if (decision === "approved") {
          const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents });
          if (blockers.length) throw new AgencyWorkflowError("Complete every required claim document before recording agency approval.", 409);
        }
        return tx.subsidyClaim.update({ where: { id: current.id }, data: { status: decision, approvedCents, approvedAt: decision === "approved" ? new Date() : null, denialReason: decision === "denied" ? denialReason : null, externalReference } });
      });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: `billing.subsidy_claim.${decision}`, resource: "SubsidyClaim", resourceId: claim.id, metadata: { approvedCents, externalReference: updated.externalReference } });
    return NextResponse.json({ ok: true, claim: updated });
  }

  if (action === "voidClaim") {
    if (!["draft", "ready"].includes(claim.status)) return NextResponse.json({ ok: false, error: "Only an unsubmitted draft claim can be voided here. Submitted decisions and payments must retain their history." }, { status: 409 });
    const reason = clean(body.reason);
    if (!reason) return NextResponse.json({ ok: false, error: "Enter a reason for voiding the draft claim." }, { status: 400 });
    const transition = await prisma.subsidyClaim.updateMany({ where: { id: claim.id, status: { in: ["draft", "ready"] } }, data: { status: "void", customFields: { ...recordValue(claim.customFields), voidReason: reason, voidedAt: new Date().toISOString(), voidedById: auth.user.id } } });
    if (transition.count !== 1) return NextResponse.json({ ok: false, error: "The claim changed before it could be voided. Refresh before trying again." }, { status: 409 });
    const updated = await prisma.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.voided", resource: "SubsidyClaim", resourceId: claim.id, metadata: { reasonRecorded: true } });
    return NextResponse.json({ ok: true, claim: updated });
  }

  if (action === "recordRemittance") {
    const amountCents = cents(body.amountDollars);
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const paymentMethod = clean(body.paymentMethod) || "ach";
    if (!reference || !paidAt || amountCents <= 0) return NextResponse.json({ ok: false, error: "A unique reference, paid date, and positive remittance amount are required." }, { status: 400 });
    if (!REMITTANCE_METHODS.has(paymentMethod)) return NextResponse.json({ ok: false, error: "Choose ACH, check, agency portal, or other as the remittance method." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await tx.subsidyClaim.findUnique({ where: { id: claim.id } });
        if (!current || !new Set(["approved", "partially_paid"]).has(current.status)) throw new AgencyWorkflowError("Record an agency approval before posting a remittance.", 409);
        const payable = current.approvedCents ?? current.claimedCents;
        if (current.paidCents + amountCents > payable) throw new AgencyWorkflowError("The remittance amount cannot exceed the remaining approved claim.");
        const remittance = await tx.subsidyRemittance.create({ data: { claimId: current.id, amountCents, paidAt, paymentMethod, externalReference: reference, notes: clean(body.notes) || null, enteredById: auth.user.id } });
        const paidCents = current.paidCents + amountCents;
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: current.claimedCents, approvedCents: current.approvedCents, paidCents }) } });
        return { remittance, claim: updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "That remittance reference is already recorded or the claim changed. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.recorded", resource: "SubsidyRemittance", resourceId: result.remittance.id, metadata: { claimId: claim.id, amountCents, externalReference: reference } });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: "Unsupported agency billing action." }, { status: 400 });
}

export const GET = withApiLogging("api.billing.agency-claims.get", getHandler);
export const POST = withApiLogging("api.billing.agency-claims.post", postHandler);
