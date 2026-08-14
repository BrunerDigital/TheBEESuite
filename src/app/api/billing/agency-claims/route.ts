import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import {
  claimAmountCents,
  claimSubmissionBlockers,
  nextRemittanceStatus,
  normalizeAgencyRequirements,
  normalizeStateCode,
  subsidyClaimNumber,
} from "@/lib/agency-subsidy-billing";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(`${text}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cents(value: unknown) {
  const amount = typeof value === "number" ? value : Number.parseFloat(clean(value).replace(/[$,]/g, "")) * 100;
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function numberValue(value: unknown) {
  const amount = typeof value === "number" ? value : Number.parseFloat(clean(value));
  return Number.isFinite(amount) ? amount : 0;
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
  const centerIds = requestedCenterId
    ? centerAllowed(auth.user, requestedCenterId) ? [requestedCenterId] : []
    : auth.user.centerIds;
  if (!centerIds.length) return NextResponse.json({ ok: false, error: "No accessible school selected." }, { status: 403 });

  const [programs, authorizations, claims, families] = await Promise.all([
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
        child: { select: { fullName: true } },
      },
    }),
    prisma.subsidyClaim.findMany({
      where: { centerId: { in: centerIds } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 250,
      include: {
        agencyProgram: { select: { name: true, programName: true, providerNumber: true, vendorNumber: true, submissionMethod: true, portalUrl: true, paymentInstructions: true } },
        authorization: { include: { child: { select: { fullName: true } }, family: { select: { name: true } } } },
        lines: true,
        documents: { orderBy: { name: "asc" } },
        remittances: { orderBy: { paidAt: "desc" } },
      },
    }),
    prisma.family.findMany({
      where: { centerId: { in: centerIds }, children: { some: { enrollmentStatus: { in: ["active", "enrolled", "currently_enrolled"] } } } },
      orderBy: { name: "asc" },
      select: { id: true, centerId: true, name: true, children: { select: { id: true, fullName: true, enrollmentStatus: true }, orderBy: { fullName: "asc" } } },
    }),
  ]);

  const summary = claims.reduce((result, claim) => {
    result.claimedCents += claim.claimedCents;
    result.approvedCents += claim.approvedCents ?? 0;
    result.paidCents += claim.paidCents;
    if (["draft", "ready"].includes(claim.status)) result.needsSubmission += 1;
    if (["submitted", "approved", "partially_paid"].includes(claim.status)) result.outstandingCents += Math.max((claim.approvedCents ?? claim.claimedCents) - claim.paidCents, 0);
    if (claim.documents.some((document) => !["received", "verified", "not_applicable"].includes(document.status))) result.missingDocumentClaims += 1;
    return result;
  }, { claimedCents: 0, approvedCents: 0, paidCents: 0, outstandingCents: 0, needsSubmission: 0, missingDocumentClaims: 0 });

  return NextResponse.json({ ok: true, programs, authorizations, claims, families, summary });
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
    const program = await prisma.agencyProgram.create({ data: {
      centerId, name, stateCode, programName: clean(body.programName) || null,
      providerNumber: clean(body.providerNumber) || null, vendorNumber: clean(body.vendorNumber) || null,
      submissionMethod: clean(body.submissionMethod) || "agency_portal", portalUrl: clean(body.portalUrl) || null,
      remittanceEmail: clean(body.remittanceEmail) || null, paymentInstructions: clean(body.paymentInstructions) || null,
      requirements, status: clean(body.providerNumber) || clean(body.vendorNumber) ? "active" : "setup_required",
    } });
    await writeAuditLog(auth.user, { centerId, action: "billing.agency_program.created", resource: "AgencyProgram", resourceId: program.id, metadata: { stateCode, name, requirementCount: requirements.length } });
    return NextResponse.json({ ok: true, program });
  }

  if (action === "createAuthorization") {
    const agencyProgramId = clean(body.agencyProgramId);
    const familyId = clean(body.familyId);
    const childId = clean(body.childId);
    const [program, family] = await Promise.all([
      prisma.agencyProgram.findUnique({ where: { id: agencyProgramId } }),
      prisma.family.findUnique({ where: { id: familyId }, include: { children: { select: { id: true } } } }),
    ]);
    if (!program || !family || program.centerId !== family.centerId || !centerAllowed(auth.user, program.centerId) || !family.children.some((child) => child.id === childId)) {
      return NextResponse.json({ ok: false, error: "Agency, family, and child must belong to the same accessible school." }, { status: 403 });
    }
    const coverageStart = dateValue(body.coverageStart);
    const coverageEnd = dateValue(body.coverageEnd);
    const authorizationNumber = clean(body.authorizationNumber);
    const authorizedRateCents = cents(body.authorizedRateDollars);
    if (!coverageStart || !coverageEnd || coverageEnd < coverageStart || !authorizationNumber || authorizedRateCents <= 0) {
      return NextResponse.json({ ok: false, error: "Authorization number, valid coverage dates, and a positive agency rate are required." }, { status: 400 });
    }
    const authorization = await prisma.subsidyAuthorization.create({ data: {
      centerId: program.centerId, agencyProgramId, familyId, childId, authorizationNumber,
      coverageStart, coverageEnd, authorizedRateCents, familyCopayCents: cents(body.familyCopayDollars),
      unitType: clean(body.unitType) || "weekly", authorizedUnits: numberValue(body.authorizedUnits) || null,
      requiredDocuments: normalizeAgencyRequirements(body.requiredDocuments),
    } });
    await writeAuditLog(auth.user, { centerId: program.centerId, action: "billing.subsidy_authorization.created", resource: "SubsidyAuthorization", resourceId: authorization.id, metadata: { agencyProgramId, familyId, childId, coverageStart, coverageEnd } });
    return NextResponse.json({ ok: true, authorization });
  }

  if (action === "createClaim") {
    const authorization = await prisma.subsidyAuthorization.findUnique({ where: { id: clean(body.authorizationId) }, include: { agencyProgram: true, child: { select: { fullName: true } } } });
    if (!authorization || !centerAllowed(auth.user, authorization.centerId)) return NextResponse.json({ ok: false, error: "Authorization not found." }, { status: 404 });
    const start = dateValue(body.servicePeriodStart);
    const end = dateValue(body.servicePeriodEnd);
    const units = numberValue(body.serviceUnits);
    const rateCents = cents(body.rateDollars) || authorization.authorizedRateCents;
    const claimedCents = claimAmountCents({ serviceUnits: units, rateCents });
    if (!start || !end || end < start || start < authorization.coverageStart || end > authorization.coverageEnd || claimedCents <= 0) {
      return NextResponse.json({ ok: false, error: "Service dates must fall within the authorization and units/rate must produce a positive claim." }, { status: 400 });
    }
    const requirements = [...normalizeAgencyRequirements(authorization.agencyProgram.requirements), ...normalizeAgencyRequirements(authorization.requiredDocuments)]
      .filter((item, index, all) => item.required && all.findIndex((candidate) => candidate.key === item.key) === index);
    const claim = await prisma.subsidyClaim.create({ data: {
      centerId: authorization.centerId, agencyProgramId: authorization.agencyProgramId, authorizationId: authorization.id,
      number: subsidyClaimNumber({ stateCode: authorization.agencyProgram.stateCode, centerId: authorization.centerId, suffix: randomUUID() }),
      servicePeriodStart: start, servicePeriodEnd: end, dueDate: dateValue(body.dueDate), claimedCents, createdById: auth.user.id,
      lines: { create: [{ childId: authorization.childId, description: clean(body.description) || `${authorization.child.fullName} subsidy care`, serviceUnits: units, unitType: authorization.unitType, rateCents, amountCents: claimedCents, attendanceDays: numberValue(body.attendanceDays) || null }] },
      documents: { create: requirements.map((requirement) => ({ name: requirement.label, type: requirement.type })) },
    }, include: { lines: true, documents: true } });
    await writeAuditLog(auth.user, { centerId: authorization.centerId, action: "billing.subsidy_claim.created", resource: "SubsidyClaim", resourceId: claim.id, metadata: { authorizationId: authorization.id, claimedCents, servicePeriodStart: start, servicePeriodEnd: end } });
    return NextResponse.json({ ok: true, claim });
  }

  const claim = await prisma.subsidyClaim.findUnique({ where: { id: clean(body.claimId) }, include: { agencyProgram: true, documents: true } });
  if (!claim || !centerAllowed(auth.user, claim.centerId)) return NextResponse.json({ ok: false, error: "Claim not found." }, { status: 404 });

  if (action === "updateDocument") {
    const status = clean(body.status);
    if (!new Set(["required", "requested", "received", "verified", "not_applicable"]).has(status)) return NextResponse.json({ ok: false, error: "Invalid document status." }, { status: 400 });
    const document = await prisma.subsidyClaimDocument.findFirst({ where: { id: clean(body.documentId), claimId: claim.id } });
    if (!document) return NextResponse.json({ ok: false, error: "Claim document not found." }, { status: 404 });
    const updated = await prisma.subsidyClaimDocument.update({ where: { id: document.id }, data: { status, documentId: clean(body.linkedDocumentId) || document.documentId, notes: clean(body.notes) || document.notes } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim_document.updated", resource: "SubsidyClaimDocument", resourceId: updated.id, metadata: { claimId: claim.id, status } });
    return NextResponse.json({ ok: true, document: updated });
  }

  if (action === "submitClaim") {
    if (claim.status !== "draft" && claim.status !== "ready") return NextResponse.json({ ok: false, error: "Only draft or ready claims can be submitted." }, { status: 409 });
    const blockers = claimSubmissionBlockers({ ...claim.agencyProgram, documents: claim.documents });
    if (blockers.length) return NextResponse.json({ ok: false, error: "Claim is not ready for submission.", blockers }, { status: 409 });
    const submitted = await prisma.subsidyClaim.update({ where: { id: claim.id }, data: { status: "submitted", submittedAt: new Date(), externalReference: clean(body.externalReference) || null } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_claim.marked_submitted", resource: "SubsidyClaim", resourceId: claim.id, metadata: { submissionMethod: claim.agencyProgram.submissionMethod, externalReference: submitted.externalReference } });
    return NextResponse.json({ ok: true, claim: submitted, externalSubmissionPerformed: false });
  }

  if (action === "recordDecision") {
    const decision = clean(body.decision);
    if (decision !== "approved" && decision !== "denied") return NextResponse.json({ ok: false, error: "Decision must be approved or denied." }, { status: 400 });
    const approvedCents = decision === "approved" ? cents(body.approvedDollars) || claim.claimedCents : 0;
    if (approvedCents > claim.claimedCents) return NextResponse.json({ ok: false, error: "Approved amount cannot exceed the claim." }, { status: 400 });
    const updated = await prisma.subsidyClaim.update({ where: { id: claim.id }, data: { status: decision, approvedCents, approvedAt: decision === "approved" ? new Date() : null, denialReason: decision === "denied" ? clean(body.denialReason) || "Agency denied claim" : null, externalReference: clean(body.externalReference) || claim.externalReference } });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: `billing.subsidy_claim.${decision}`, resource: "SubsidyClaim", resourceId: claim.id, metadata: { approvedCents, externalReference: updated.externalReference } });
    return NextResponse.json({ ok: true, claim: updated });
  }

  if (action === "recordRemittance") {
    const amountCents = cents(body.amountDollars);
    const reference = clean(body.externalReference);
    const paidAt = dateValue(body.paidAt);
    const payable = claim.approvedCents ?? claim.claimedCents;
    if (!reference || !paidAt || amountCents <= 0 || claim.paidCents + amountCents > payable) return NextResponse.json({ ok: false, error: "A unique reference, paid date, and amount not exceeding the remaining approved claim are required." }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const remittance = await tx.subsidyRemittance.create({ data: { claimId: claim.id, amountCents, paidAt, paymentMethod: clean(body.paymentMethod) || "ach", externalReference: reference, notes: clean(body.notes) || null, enteredById: auth.user.id } });
      const paidCents = claim.paidCents + amountCents;
      const updated = await tx.subsidyClaim.update({ where: { id: claim.id }, data: { paidCents, status: nextRemittanceStatus({ claimedCents: claim.claimedCents, approvedCents: claim.approvedCents, paidCents }) } });
      return { remittance, claim: updated };
    });
    await writeAuditLog(auth.user, { centerId: claim.centerId, action: "billing.subsidy_remittance.recorded", resource: "SubsidyRemittance", resourceId: result.remittance.id, metadata: { claimId: claim.id, amountCents, externalReference: reference } });
    return NextResponse.json({ ok: true, ...result });
  }

  return NextResponse.json({ ok: false, error: "Unsupported agency billing action." }, { status: 400 });
}

export const GET = withApiLogging("api.billing.agency-claims.get", getHandler);
export const POST = withApiLogging("api.billing.agency-claims.post", postHandler);
