import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import {
  activeRemittanceTotalCents,
  AGENCY_SUBMISSION_METHODS,
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
const SUBMISSION_METHODS = new Set<string>(AGENCY_SUBMISSION_METHODS);
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

function claimRequirements(claim: {
  agencyProgram: { requirements?: unknown };
  authorization?: { requiredDocuments?: unknown } | null;
}) {
  return [
    ...normalizeAgencyRequirements(claim.agencyProgram.requirements),
    ...normalizeAgencyRequirements(claim.authorization?.requiredDocuments),
  ].filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
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
              agencyProgram: { select: { name: true, requirements: true } },
              authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
              documents: { orderBy: { name: "asc" } },
            },
          });
          if (!claims.length) break;
          const chunk = claims.map((claim) => {
            const missingDocuments = claim.documents
              .filter((document) => !["received", "verified", "not_applicable"].includes(document.status))
              .map((document) => document.name);
            if (["draft", "ready", "submitted"].includes(claim.status)) {
              const documentKeys = new Set(claim.documents.map((document) => `${document.name.trim().toLowerCase()}|${document.type.trim().toLowerCase()}`));
              for (const requirement of claimRequirements(claim)) {
                const key = `${requirement.label.trim().toLowerCase()}|${requirement.type.trim().toLowerCase()}`;
                if (!documentKeys.has(key)) missingDocuments.push(requirement.label);
              }
            }
            return csvRow([
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
              [...new Set(missingDocuments)].join("; "),
            ]);
          }).join("");
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
        agencyProgram: { select: { name: true, programName: true, providerNumber: true, vendorNumber: true, submissionMethod: true, portalUrl: true, paymentInstructions: true, requirements: true } },
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
        COUNT(*) FILTER (WHERE claim.status IN ('draft', 'ready', 'submitted') AND (
          EXISTS (
            SELECT 1 FROM "SubsidyClaimDocument" document
            WHERE document."claimId" = claim.id
              AND document.status NOT IN ('received', 'verified', 'not_applicable')
          ) OR EXISTS (
            SELECT 1
            FROM (
              SELECT DISTINCT ON (requirement_key) requirement
              FROM (
                SELECT requirement, 0 AS source_order, ordinal
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(program.requirements) = 'array' THEN program.requirements ELSE '[]'::jsonb END) WITH ORDINALITY AS program_requirement(requirement, ordinal)
                UNION ALL
                SELECT requirement, 1 AS source_order, ordinal
                FROM jsonb_array_elements(CASE WHEN jsonb_typeof(subsidy_authorization."requiredDocuments") = 'array' THEN subsidy_authorization."requiredDocuments" ELSE '[]'::jsonb END) WITH ORDINALITY AS authorization_requirement(requirement, ordinal)
              ) raw_requirement
              CROSS JOIN LATERAL (
                SELECT REGEXP_REPLACE(
                  LOWER(COALESCE(NULLIF(raw_requirement.requirement->>'key', ''), COALESCE(NULLIF(raw_requirement.requirement->>'type', ''), 'supporting_document') || ':' || COALESCE(raw_requirement.requirement->>'label', ''))),
                  '[^a-z0-9:_-]+', '-', 'g'
                ) AS requirement_key
              ) normalized_requirement
              ORDER BY requirement_key, source_order, ordinal
            ) current_requirement
            WHERE COALESCE(current_requirement.requirement->>'label', '') <> ''
              AND COALESCE(current_requirement.requirement->>'required', 'true') <> 'false'
              AND NOT EXISTS (
                SELECT 1 FROM "SubsidyClaimDocument" current_document
                WHERE current_document."claimId" = claim.id
                  AND LOWER(TRIM(current_document.name)) = LOWER(TRIM(current_requirement.requirement->>'label'))
                  AND LOWER(TRIM(current_document.type)) = LOWER(TRIM(COALESCE(NULLIF(current_requirement.requirement->>'type', ''), 'supporting_document')))
              )
          )
        ))::bigint AS "missingDocumentClaims"
      FROM "SubsidyClaim" claim
      JOIN "AgencyProgram" program ON program.id = claim."agencyProgramId"
      LEFT JOIN "SubsidyAuthorization" subsidy_authorization ON subsidy_authorization.id = claim."authorizationId"
      WHERE claim."centerId" IN (${Prisma.join(centerIds)})
        AND claim.status <> 'void'
    `),
    prisma.family.findMany({
      where: { centerId: { in: centerIds }, children: { some: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] } } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        centerId: true,
        name: true,
        guardians: { select: { fullName: true }, orderBy: { fullName: "asc" } },
        children: { where: { OR: [{ enrollmentStatus: { in: CURRENT_ENROLLMENT_STATUSES }, classroomId: { not: null } }, { subsidyAuthorizations: { some: {} } }] }, select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true }, orderBy: { fullName: "asc" } },
      },
    }),
  ]);

  const hasNextClaimPage = claims.length > CLAIM_PAGE_SIZE;
  const visibleClaims = claims.slice(0, CLAIM_PAGE_SIZE).map((claim) => ({
    ...claim,
    requirementBlockers: ["draft", "ready", "submitted"].includes(claim.status) ? claimSubmissionBlockers({
      ...claim.agencyProgram,
      documents: claim.documents,
      requirements: claimRequirements(claim),
    }).filter((blocker) => blocker.startsWith("Add current required item:")) : [],
  }));
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
    if (!SUBMISSION_METHODS.has(setup.submissionMethod)) return NextResponse.json({ ok: false, error: "Choose a supported agency submission method." }, { status: 400 });
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
    if (!SUBMISSION_METHODS.has(setup.submissionMethod)) return NextResponse.json({ ok: false, error: "Choose a supported agency submission method." }, { status: 400 });
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
      authorization = await prisma.$transaction(async (tx) => {
        const [program, family] = await Promise.all([
          tx.agencyProgram.findUnique({ where: { id: agencyProgramId } }),
          tx.family.findUnique({ where: { id: familyId }, include: { children: { select: { id: true, enrollmentStatus: true, classroomId: true } } } }),
        ]);
        const child = family?.children.find((item) => item.id === childId);
        if (!program || !family || program.centerId !== family.centerId || !centerAllowed(auth.user, program.centerId) || !child) {
          throw new AgencyWorkflowError("Agency, family, and child must belong to the same accessible school.", 403);
        }
        if (!isCurrentlyEnrolledChildRecord(child)) throw new AgencyWorkflowError("Only a currently enrolled child with an assigned classroom can receive a new agency authorization.", 409);
        const programBlockers = agencyProgramSetupBlockers(program);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before adding child authorizations. ${programBlockers.join(" ")}`, 409);
        return tx.subsidyAuthorization.create({ data: {
          centerId: program.centerId, agencyProgramId, familyId, childId, authorizationNumber,
          coverageStart, coverageEnd, authorizedRateCents, familyCopayCents,
          unitType, authorizedUnits,
          requiredDocuments: normalizeAgencyRequirements(body.requiredDocuments),
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) {
        return NextResponse.json({ ok: false, error: "This authorization already exists for the selected child. Use Edit authorization to correct its rate or dates." }, { status: 409 });
      }
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_authorization.created", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { agencyProgramId, familyId, childId, coverageStart, coverageEnd } });
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
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const authorization = await tx.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { enrollmentStatus: true, classroomId: true } } } });
        if (!authorization || !centerAllowed(auth.user, authorization.centerId)) throw new AgencyWorkflowError("Authorization not found.", 404);
        if (!isCurrentlyEnrolledChildRecord(authorization.child)) throw new AgencyWorkflowError("Only an authorization for a currently enrolled child with an assigned classroom can be restored.", 409);
        const programBlockers = agencyProgramSetupBlockers(authorization.agencyProgram);
        if (programBlockers.length) throw new AgencyWorkflowError(`Complete agency setup before restoring this authorization. ${programBlockers.join(" ")}`, 409);
        const transition = await tx.subsidyAuthorization.updateMany({ where: { id: authorization.id, status: { not: "active" } }, data: { status: "active" } });
        const updated = transition.count ? await tx.subsidyAuthorization.findUniqueOrThrow({ where: { id: authorization.id } }) : authorization;
        return { authorization, updated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The authorization changed while it was being restored. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { authorization, updated } = result;
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
        }, include: {
          agencyProgram: { select: { name: true } },
          authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
          lines: true,
          documents: { orderBy: { name: "asc" } },
          remittances: { orderBy: { paidAt: "desc" } },
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "Another claim was created for this authorization at the same time. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.created", resource: "SubsidyClaim", resourceId: claim.id, metadata: { authorizationId: claim.authorizationId, claimedCents: claim.claimedCents, servicePeriodStart: start, servicePeriodEnd: end } });
    return NextResponse.json({ ok: true, claim });
  }

  const claim = await prisma.subsidyClaim.findUnique({ where: { id: clean(body.claimId) }, include: { agencyProgram: true, authorization: true, documents: true } });
  if (!claim || !centerAllowed(auth.user, claim.centerId)) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  if (action === "syncRequirements") {
    let missing: ReturnType<typeof claimRequirements> = [];
    try {
      missing = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({
          where: { id: claim.id, status: { in: ["draft", "ready", "submitted"] } },
          data: { updatedAt: new Date() },
        });
        if (transition.count !== 1) throw new AgencyWorkflowError("Requirements cannot be changed after the agency decision is recorded.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({
          where: { id: claim.id },
          include: { agencyProgram: true, authorization: true, documents: true },
        });
        const requirements = claimRequirements(current);
        const existing = new Set(current.documents.map((document) => `${document.name.trim().toLowerCase()}|${document.type.trim().toLowerCase()}`));
        const missingRequirements = requirements.filter((requirement) => !existing.has(`${requirement.label.trim().toLowerCase()}|${requirement.type.trim().toLowerCase()}`));
        if (missingRequirements.length) await tx.subsidyClaimDocument.createMany({ data: missingRequirements.map((requirement) => ({ claimId: current.id, name: requirement.label, type: requirement.type })) });
        return missingRequirements;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim changed while requirements were synchronized. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.requirements_synced", resource: "SubsidyClaim", resourceId: claim.id, metadata: { addedCount: missing.length, requirementLabels: missing.map((item) => item.label) } });
    return NextResponse.json({ ok: true, addedCount: missing.length });
  }

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
    const externalReference = clean(body.externalReference);
    if (!externalReference) return NextResponse.json({ ok: false, error: "Enter the confirmation reference returned by the external agency channel." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const transition = await tx.subsidyClaim.updateMany({ where: { id: claim.id, status: { in: ["draft", "ready"] } }, data: { updatedAt: new Date() } });
        if (transition.count !== 1) throw new AgencyWorkflowError("Only a current draft or ready claim can be submitted.", 409);
        const current = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { agencyProgram: true, authorization: true, documents: true } });
        const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
        if (blockers.length) throw new AgencyWorkflowError(`Claim is not ready for submission. ${blockers.join(" ")}`, 409);
        const submitted = await tx.subsidyClaim.update({ where: { id: current.id }, data: { status: "submitted", submittedAt: new Date(), externalReference } });
        return { submitted, submissionMethod: current.agencyProgram.submissionMethod };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The claim or its requirements changed before submission was recorded. Refresh and try again." }, { status: 409 });
      throw error;
    }
    const { submitted, submissionMethod } = result;
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.marked_submitted", resource: "SubsidyClaim", resourceId: claim.id, metadata: { submissionMethod, externalReference: submitted.externalReference } });
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
        const current = await tx.subsidyClaim.findUniqueOrThrow({ where: { id: claim.id }, include: { agencyProgram: true, authorization: true, documents: true } });
        if (decision === "approved") {
          const blockers = claimSubmissionBlockers({ ...current.agencyProgram, documents: current.documents, requirements: claimRequirements(current) });
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
        const current = await tx.subsidyClaim.findUnique({
          where: { id: claim.id },
          include: { agencyProgram: true, authorization: { include: { family: { include: { billingAccount: true } } } }, remittances: true },
        });
        if (!current || !new Set(["approved", "partially_paid"]).has(current.status)) throw new AgencyWorkflowError("Record an agency approval before posting a remittance.", 409);
        const payable = current.approvedCents ?? current.claimedCents;
        const paidBeforeCents = activeRemittanceTotalCents(current.remittances);
        if (paidBeforeCents + amountCents > payable) throw new AgencyWorkflowError("The remittance amount cannot exceed the remaining approved claim.");
        const remittance = await tx.subsidyRemittance.create({ data: { claimId: current.id, amountCents, paidAt, paymentMethod, externalReference: reference, notes: clean(body.notes) || null, enteredById: auth.user.id } });
        let ledgerAppliedCents = 0;
        let ledgerEntryId: string | null = null;
        const billingAccount = current.authorization?.family.billingAccount;
        if (billingAccount) {
          const authorizationNumber = current.authorization?.authorizationNumber ?? "";
          const agencyEntries = await tx.ledgerEntry.findMany({
            where: { billingAccountId: billingAccount.id, sourceSystem: "subsidy_agency" },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          });
          const matchingOutstandingCents = agencyEntries.reduce((total, entry) => {
            const metadata = recordValue(entry.metadata);
            const entryAuthorizationNumber = clean(metadata.authorizationNumber);
            const entryAgencyName = clean(metadata.agencyName).toLowerCase();
            const agencyName = current.agencyProgram.name.trim().toLowerCase();
            const matches = entryAuthorizationNumber && entryAgencyName
              ? entryAuthorizationNumber === authorizationNumber && entryAgencyName === agencyName
              : entryAuthorizationNumber
                ? entryAuthorizationNumber === authorizationNumber
                : entryAgencyName === agencyName;
            return matches ? total + entry.amountCents : total;
          }, 0);
          ledgerAppliedCents = Math.min(amountCents, Math.max(0, matchingOutstandingCents));
          if (ledgerAppliedCents > 0) {
            const updatedAccount = await tx.billingAccount.update({ where: { id: billingAccount.id }, data: { balanceCents: { decrement: ledgerAppliedCents } } });
            const ledgerEntry = await tx.ledgerEntry.create({ data: {
              billingAccountId: billingAccount.id,
              type: "agency_payment",
              description: `${current.agencyProgram.name} remittance for ${current.number}`,
              amountCents: -ledgerAppliedCents,
              balanceAfterCents: updatedAccount.balanceCents,
              effectiveAt: paidAt,
              sourceSystem: "subsidy_agency",
              externalId: `agency-remittance:${remittance.id}`,
              metadata: { claimId: current.id, claimNumber: current.number, remittanceId: remittance.id, agencyName: current.agencyProgram.name, authorizationNumber, externalReference: reference },
            } });
            ledgerEntryId = ledgerEntry.id;
          }
        }
        const paidCents = paidBeforeCents + amountCents;
        const updated = await tx.subsidyClaim.update({ where: { id: current.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: current.claimedCents, approvedCents: current.approvedCents, paidCents }) } });
        return { remittance, claim: updated, ledgerAppliedCents, ledgerEntryId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "That remittance reference is already recorded or the claim changed. Refresh before trying again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.recorded", resource: "SubsidyRemittance", resourceId: result.remittance.id, metadata: { claimId: claim.id, amountCents, externalReference: reference, ledgerAppliedCents: result.ledgerAppliedCents, ledgerEntryId: result.ledgerEntryId } });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "reverseRemittance") {
    const remittanceId = clean(body.remittanceId);
    const reason = clean(body.reason);
    if (!remittanceId || !reason) return NextResponse.json({ ok: false, error: "Choose a remittance and enter a correction reason." }, { status: 400 });
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const remittance = await tx.subsidyRemittance.findFirst({ where: { id: remittanceId, claimId: claim.id }, include: { claim: true } });
        if (!remittance) throw new AgencyWorkflowError("Remittance not found.", 404);
        if (remittance.reversedAt) throw new AgencyWorkflowError("This remittance was already reversed.", 409);
        const transition = await tx.subsidyRemittance.updateMany({ where: { id: remittance.id, reversedAt: null }, data: { reversedAt: new Date(), reversedById: auth.user.id, reversalReason: reason } });
        if (transition.count !== 1) throw new AgencyWorkflowError("The remittance changed before it could be reversed. Refresh and try again.", 409);
        const paymentEntry = await tx.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "subsidy_agency", externalId: `agency-remittance:${remittance.id}` } } });
        let reversalLedgerEntryId: string | null = null;
        if (paymentEntry && paymentEntry.amountCents < 0) {
          const updatedAccount = await tx.billingAccount.update({ where: { id: paymentEntry.billingAccountId }, data: { balanceCents: { increment: Math.abs(paymentEntry.amountCents) } } });
          const reversalEntry = await tx.ledgerEntry.create({ data: {
            billingAccountId: paymentEntry.billingAccountId,
            type: "agency_payment_reversal",
            description: `Reversed agency remittance for ${remittance.claim.number}`,
            amountCents: Math.abs(paymentEntry.amountCents),
            balanceAfterCents: updatedAccount.balanceCents,
            sourceSystem: "subsidy_agency",
            externalId: `agency-remittance-reversal:${remittance.id}`,
            metadata: { ...recordValue(paymentEntry.metadata), remittanceId: remittance.id, claimId: claim.id, originalLedgerEntryId: paymentEntry.id, reason },
          } });
          reversalLedgerEntryId = reversalEntry.id;
        }
        const activeRemittances = await tx.subsidyRemittance.findMany({ where: { claimId: claim.id, reversedAt: null }, select: { amountCents: true, reversedAt: true } });
        const paidCents = activeRemittanceTotalCents(activeRemittances);
        const updated = await tx.subsidyClaim.update({ where: { id: claim.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: remittance.claim.claimedCents, approvedCents: remittance.claim.approvedCents, paidCents }) } });
        return { remittanceId: remittance.id, claim: updated, reversalLedgerEntryId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof AgencyWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
      if (prismaConflict(error)) return NextResponse.json({ ok: false, error: "The remittance changed while it was being reversed. Refresh and try again." }, { status: 409 });
      throw error;
    }
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.reversed", resource: "SubsidyRemittance", resourceId: result.remittanceId, metadata: { claimId: claim.id, reason, reversalLedgerEntryId: result.reversalLedgerEntryId } });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: "Unsupported agency billing action." }, { status: 400 });
}

export const GET = withApiLogging("api.billing.agency-claims.get", getHandler);
export const POST = withApiLogging("api.billing.agency-claims.post", postHandler);
