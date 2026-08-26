import "./load-env";

import { createHash } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessCenter, canManageBilling } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const APPLY = "--apply";
const FINGERPRINT_ARG = "--confirm-fingerprint=";

const EXPECTED = {
  tenantId: "cmp4evl4v00006arspz79fggn",
  centerId: "cmp4ewela003u6alw9ii7uffs",
  programId: "agency_6ad29b2fac95ab453b206817",
  actorEmail: "brenden@kidcityusa.com",
  evidenceMessageId: "1a03e80a5ee75b78",
  evidenceThreadId: "1a01a5d5088f300b",
  evidenceFilename: "CCDF Payment Tracker 2026.xlsx",
  evidenceSha256: "2D0B78F7A97EBE1A431CE1706EFFC8A10A988D33631F5BBB997BCDC6B28C49BF",
  kaiden: {
    authorizationId: "cmt1wrocv000bjr04uotvbqfn",
    childId: "cmt1wpf5i0006jr04ol691sib",
    familyId: "cms3pk9jf0000ju04l3yqwnh3",
    authorizationNumber: "11495724",
    claimId: "cmt1wu71z000qjr0446r7vmkp",
    lineId: "cmt1wu71z000sjr04ppwzcnpb",
  },
  kaia: {
    authorizationId: "cmt1wxqir000kkt04f7zrdsn4",
    childId: "cmrnywq5z000vjs04lph9l8kd",
    familyId: "cmrnxyw830000jp04rxmcy18m",
    authorizationNumber: "11494623",
    claimId: "cmt1wyp8t000okt04uaf4kjlk",
    lineId: "cmt1wyp8t000qkt04m4x1j5a3",
  },
  wrenly: {
    childId: "cms6ecqc10003js04uunoqljo",
    familyId: "cms3pk9jf0000ju04l3yqwnh3",
    currentAuthorizationId: "cmt068xmg0002kv043wrunkit",
    currentAuthorizationNumber: "11536471",
    historicalAuthorizationNumber: "11495701",
  },
  oakleigh: {
    authorizationId: "cmt1wa1x80024ld041rr48s3o",
    childId: "cmrnxywpr0004jp04yq79xvge",
    familyId: "cmrnxyw830000jp04rxmcy18m",
    previousAuthorizationNumber: "391775",
    authorizationNumber: "11494621",
  },
  lyla: {
    authorizationId: "cmt1w7l3r0013jx042irdfeqe",
    childId: "cmry0e38p0001jt04l57n6acq",
    familyId: "cmry08d080000l304crb30swd",
    previousAuthorizationNumber: "377998",
    authorizationNumber: "11515993",
  },
} as const;

const AUTHORIZATION_SCOPES = new Map<string, { familyId: string; childId: string }>([
  [EXPECTED.kaiden.authorizationId, { familyId: EXPECTED.kaiden.familyId, childId: EXPECTED.kaiden.childId }],
  [EXPECTED.kaia.authorizationId, { familyId: EXPECTED.kaia.familyId, childId: EXPECTED.kaia.childId }],
  [EXPECTED.wrenly.currentAuthorizationId, { familyId: EXPECTED.wrenly.familyId, childId: EXPECTED.wrenly.childId }],
  [EXPECTED.oakleigh.authorizationId, { familyId: EXPECTED.oakleigh.familyId, childId: EXPECTED.oakleigh.childId }],
  [EXPECTED.lyla.authorizationId, { familyId: EXPECTED.lyla.familyId, childId: EXPECTED.lyla.childId }],
]);

const d = (value: string) => new Date(`${value}T12:00:00.000Z`);

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function source(sheet: string, row: number, reportedPaymentDate: string, reportedPaymentCents: number): Prisma.InputJsonObject {
  return {
    messageId: EXPECTED.evidenceMessageId,
    threadId: EXPECTED.evidenceThreadId,
    filename: EXPECTED.evidenceFilename,
    sha256: EXPECTED.evidenceSha256,
    sheet,
    row,
    reportedPaymentDate,
    reportedPaymentCents,
  };
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const accessAsOf = new Date();
  const authorizationIds = [
    EXPECTED.kaiden.authorizationId,
    EXPECTED.kaia.authorizationId,
    EXPECTED.wrenly.currentAuthorizationId,
    EXPECTED.oakleigh.authorizationId,
    EXPECTED.lyla.authorizationId,
  ];
  const [center, actor, authorizations, claims, historicalWrenly] = await Promise.all([
    client.center.findUnique({
      where: { id: EXPECTED.centerId },
      select: { id: true, name: true, organization: { select: { tenantId: true } } },
    }),
    client.user.findUnique({
      where: { email: EXPECTED.actorEmail },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        isActive: true,
        staffProfile: { select: { centerId: true } },
        accessGrants: {
          where: {
            tenantId: EXPECTED.tenantId,
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: accessAsOf } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: accessAsOf } }] },
            ],
          },
          select: { id: true, tenantId: true, centerId: true, scopeType: true, role: true, startsAt: true, endsAt: true },
          orderBy: { id: "asc" },
        },
      },
    }),
    client.subsidyAuthorization.findMany({
      where: { id: { in: authorizationIds } },
      select: {
        id: true, centerId: true, agencyProgramId: true, familyId: true, childId: true,
        authorizationNumber: true, coverageStart: true, coverageEnd: true,
        authorizedRateCents: true, familyCopayCents: true, unitType: true,
        authorizedUnits: true, status: true, customFields: true,
      },
      orderBy: { id: "asc" },
    }),
    client.subsidyClaim.findMany({
      where: { authorizationId: { in: authorizationIds }, status: { not: "void" } },
      select: {
        id: true, centerId: true, agencyProgramId: true, authorizationId: true, number: true,
        servicePeriodStart: true, servicePeriodEnd: true, status: true, claimedCents: true,
        approvedCents: true, paidCents: true, submittedAt: true, externalReference: true,
        customFields: true,
        lines: {
          select: { id: true, childId: true, serviceUnits: true, unitType: true, rateCents: true, amountCents: true, attendanceDays: true },
          orderBy: { id: "asc" },
        },
        remittances: { select: { id: true, externalReference: true, amountCents: true, reversedAt: true } },
      },
      orderBy: { id: "asc" },
    }),
    client.subsidyAuthorization.findUnique({
      where: { agencyProgramId_authorizationNumber_childId: {
        agencyProgramId: EXPECTED.programId,
        authorizationNumber: EXPECTED.wrenly.historicalAuthorizationNumber,
        childId: EXPECTED.wrenly.childId,
      } },
      select: {
        id: true, centerId: true, agencyProgramId: true, familyId: true, childId: true,
        authorizationNumber: true, coverageStart: true, coverageEnd: true,
        authorizedRateCents: true, familyCopayCents: true, unitType: true,
        authorizedUnits: true, status: true, customFields: true,
      },
    }),
  ]);

  invariant(center?.organization.tenantId === EXPECTED.tenantId, "Kokomo tenant/center identity changed.");
  invariant(actor?.tenantId === EXPECTED.tenantId && actor.isActive, "Active audit actor was not found in the expected tenant.");
  const directCenterGrant = actor.accessGrants.some((grant) => grant.scopeType === "CENTER" && grant.centerId === EXPECTED.centerId);
  const actorCenterIds = actor.staffProfile?.centerId === EXPECTED.centerId || directCenterGrant ? [EXPECTED.centerId] : [];
  const actorScope = {
    role: actor.role,
    accessScope: actor.role === UserRole.PLATFORM_OWNER
      ? "platform" as const
      : actor.role === UserRole.BRAND_ADMIN || actor.role === UserRole.REGIONAL_MANAGER
        ? "tenant" as const
        : actor.accessGrants.some((grant) => grant.scopeType === "TENANT" && grant.tenantId === EXPECTED.tenantId)
          ? "tenant" as const
          : actorCenterIds.length
            ? "scoped" as const
          : "none" as const,
    centerIds: actorCenterIds,
  };
  invariant(canManageBilling(actor) && canAccessCenter(actorScope, EXPECTED.centerId), "Audit actor no longer has active Kokomo billing access.");
  invariant(authorizations.length === 5, `Expected five exact authorization rows; found ${authorizations.length}.`);

  return { center, actor, authorizations, claims, historicalWrenly };
}

function authorization(state: Awaited<ReturnType<typeof loadState>>, id: string) {
  const row = state.authorizations.find((item) => item.id === id);
  invariant(row, `Authorization ${id} was not found.`);
  const scope = AUTHORIZATION_SCOPES.get(id);
  invariant(scope && row.centerId === EXPECTED.centerId && row.agencyProgramId === EXPECTED.programId && row.familyId === scope.familyId && row.childId === scope.childId, `Authorization ${id} is no longer in the expected Kokomo program, family, and child scope.`);
  return row;
}

function claim(state: Awaited<ReturnType<typeof loadState>>, id: string, lineId: string, authorizationId: string, childId: string) {
  const row = state.claims.find((item) => item.id === id);
  invariant(row, `Claim ${id} was not found.`);
  invariant(row.centerId === EXPECTED.centerId && row.agencyProgramId === EXPECTED.programId && row.authorizationId === authorizationId, `Claim ${id} is no longer in the expected Kokomo program and authorization.`);
  invariant(row.lines.length === 1 && row.lines[0].id === lineId && row.lines[0].childId === childId, `Claim ${id} no longer has its one expected child line.`);
  return { row, line: row.lines[0] };
}

function hasWorkbookEvidence(customFields: Prisma.JsonValue | null, sheet: string, row: number) {
  const reconciliation = object(object(customFields).reconciliation as Prisma.JsonValue);
  const workbook = object(reconciliation.workbook as Prisma.JsonValue);
  return reconciliation.source === "director_email_attachment"
    && workbook.messageId === EXPECTED.evidenceMessageId
    && workbook.sha256 === EXPECTED.evidenceSha256
    && workbook.sheet === sheet
    && workbook.row === row;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function verifyInitial(state: Awaited<ReturnType<typeof loadState>>) {
  const reviewedClaimIds = new Set<string>([EXPECTED.kaiden.claimId, EXPECTED.kaia.claimId]);
  invariant(state.claims.length === reviewedClaimIds.size && state.claims.every((row) => reviewedClaimIds.has(row.id)), `Expected only the two reviewed non-void draft claims across the five authorizations; found ${state.claims.length}.`);
  const kaiden = authorization(state, EXPECTED.kaiden.authorizationId);
  invariant(kaiden.authorizationNumber === EXPECTED.kaiden.authorizationNumber && kaiden.childId === EXPECTED.kaiden.childId && kaiden.familyId === EXPECTED.kaiden.familyId, "Kaiden authorization identity changed.");
  invariant(dateOnly(kaiden.coverageStart) === "2026-07-12" && dateOnly(kaiden.coverageEnd) === "2026-07-18" && kaiden.authorizedRateCents === 13_500 && kaiden.familyCopayCents === 0, "Kaiden authorization no longer matches the reviewed pre-correction state.");

  const kaia = authorization(state, EXPECTED.kaia.authorizationId);
  invariant(kaia.authorizationNumber === EXPECTED.kaia.authorizationNumber && kaia.childId === EXPECTED.kaia.childId && kaia.familyId === EXPECTED.kaia.familyId, "Kaia authorization identity changed.");
  invariant(dateOnly(kaia.coverageStart) === "2026-07-12" && dateOnly(kaia.coverageEnd) === "2026-07-25" && kaia.authorizedRateCents === 13_500 && kaia.familyCopayCents === 0, "Kaia authorization no longer matches the reviewed pre-correction state.");

  const wrenly = authorization(state, EXPECTED.wrenly.currentAuthorizationId);
  invariant(wrenly.authorizationNumber === EXPECTED.wrenly.currentAuthorizationNumber && wrenly.childId === EXPECTED.wrenly.childId && wrenly.familyId === EXPECTED.wrenly.familyId, "Wrenly current authorization identity changed.");
  invariant(dateOnly(wrenly.coverageStart) === "2026-08-03" && dateOnly(wrenly.coverageEnd) === "2026-10-17" && wrenly.authorizedRateCents === 31_300 && wrenly.familyCopayCents === 0, "Wrenly current authorization no longer matches the reviewed pre-correction state.");
  invariant(state.historicalWrenly === null, "Wrenly historical authorization already exists; rerun in verification mode.");

  const oakleigh = authorization(state, EXPECTED.oakleigh.authorizationId);
  invariant(oakleigh.authorizationNumber === EXPECTED.oakleigh.previousAuthorizationNumber && oakleigh.childId === EXPECTED.oakleigh.childId && oakleigh.familyId === EXPECTED.oakleigh.familyId, "Oakleigh authorization no longer matches the reviewed pre-correction state.");
  invariant(dateOnly(oakleigh.coverageStart) === "2026-08-02" && dateOnly(oakleigh.coverageEnd) === "2026-10-10" && oakleigh.authorizedRateCents === 19_100 && oakleigh.familyCopayCents === 1_900, "Oakleigh authorization no longer matches the reviewed pre-correction state.");

  const lyla = authorization(state, EXPECTED.lyla.authorizationId);
  invariant(lyla.authorizationNumber === EXPECTED.lyla.previousAuthorizationNumber && lyla.childId === EXPECTED.lyla.childId && lyla.familyId === EXPECTED.lyla.familyId, "Lyla authorization no longer matches the reviewed pre-correction state.");
  invariant(dateOnly(lyla.coverageStart) === "2026-08-02" && dateOnly(lyla.coverageEnd) === "2026-10-10" && lyla.authorizedRateCents === 38_700 && lyla.familyCopayCents === 0, "Lyla authorization terms changed.");

  const kaidenClaim = claim(state, EXPECTED.kaiden.claimId, EXPECTED.kaiden.lineId, EXPECTED.kaiden.authorizationId, EXPECTED.kaiden.childId);
  invariant(kaidenClaim.row.status === "draft" && kaidenClaim.row.claimedCents === 27_000 && kaidenClaim.row.approvedCents === null && kaidenClaim.row.paidCents === 0 && kaidenClaim.row.submittedAt === null && kaidenClaim.row.externalReference === null && kaidenClaim.row.remittances.length === 0, "Kaiden claim is no longer an unsettled draft in the reviewed state.");
  invariant(dateOnly(kaidenClaim.row.servicePeriodStart) === "2026-07-12" && dateOnly(kaidenClaim.row.servicePeriodEnd) === "2026-07-18" && kaidenClaim.line.serviceUnits === 2 && kaidenClaim.line.rateCents === 13_500 && kaidenClaim.line.amountCents === 27_000, "Kaiden draft claim values changed.");

  const kaiaClaim = claim(state, EXPECTED.kaia.claimId, EXPECTED.kaia.lineId, EXPECTED.kaia.authorizationId, EXPECTED.kaia.childId);
  invariant(kaiaClaim.row.status === "draft" && kaiaClaim.row.claimedCents === 27_000 && kaiaClaim.row.approvedCents === null && kaiaClaim.row.paidCents === 0 && kaiaClaim.row.submittedAt === null && kaiaClaim.row.externalReference === null && kaiaClaim.row.remittances.length === 0, "Kaia claim is no longer an unsettled draft in the reviewed state.");
  invariant(dateOnly(kaiaClaim.row.servicePeriodStart) === "2026-07-12" && dateOnly(kaiaClaim.row.servicePeriodEnd) === "2026-07-25" && kaiaClaim.line.serviceUnits === 2 && kaiaClaim.line.rateCents === 13_500 && kaiaClaim.line.amountCents === 27_000, "Kaia draft claim values changed.");
}

function verifyFinal(state: Awaited<ReturnType<typeof loadState>>) {
  const kaiden = authorization(state, EXPECTED.kaiden.authorizationId);
  const kaia = authorization(state, EXPECTED.kaia.authorizationId);
  const wrenly = authorization(state, EXPECTED.wrenly.currentAuthorizationId);
  const oakleigh = authorization(state, EXPECTED.oakleigh.authorizationId);
  const lyla = authorization(state, EXPECTED.lyla.authorizationId);
  const kaidenClaim = claim(state, EXPECTED.kaiden.claimId, EXPECTED.kaiden.lineId, EXPECTED.kaiden.authorizationId, EXPECTED.kaiden.childId);
  const kaiaClaim = claim(state, EXPECTED.kaia.claimId, EXPECTED.kaia.lineId, EXPECTED.kaia.authorizationId, EXPECTED.kaia.childId);

  invariant(kaiden.familyCopayCents === 7_500, "Kaiden copay correction was not applied.");
  invariant(dateOnly(kaia.coverageStart) === "2026-07-19" && kaia.familyCopayCents === 7_500, "Kaia authorization correction was not applied.");
  invariant(dateOnly(wrenly.coverageStart) === "2026-08-02", "Wrenly current authorization start correction was not applied.");
  invariant(oakleigh.authorizationNumber === EXPECTED.oakleigh.authorizationNumber && dateOnly(oakleigh.coverageStart) === "2026-07-19" && dateOnly(oakleigh.coverageEnd) === "2026-10-03", "Oakleigh authorization number/date correction was not applied.");
  invariant(lyla.authorizationNumber === EXPECTED.lyla.authorizationNumber, "Lyla authorization number correction was not applied.");
  invariant(state.historicalWrenly?.centerId === EXPECTED.centerId && state.historicalWrenly.agencyProgramId === EXPECTED.programId && state.historicalWrenly.familyId === EXPECTED.wrenly.familyId && state.historicalWrenly.childId === EXPECTED.wrenly.childId && state.historicalWrenly.authorizationNumber === EXPECTED.wrenly.historicalAuthorizationNumber && dateOnly(state.historicalWrenly.coverageStart) === "2026-07-12" && dateOnly(state.historicalWrenly.coverageEnd) === "2026-07-18" && state.historicalWrenly.authorizedRateCents === 31_300, "Wrenly historical authorization was not preserved in the expected Kokomo family and child scope.");
  invariant(kaidenClaim.row.claimedCents === 13_500 && kaidenClaim.line.serviceUnits === 1 && kaidenClaim.line.amountCents === 13_500 && hasWorkbookEvidence(kaidenClaim.row.customFields, "July 12-26", 2), "Kaiden claim correction and workbook provenance were not preserved.");
  invariant(dateOnly(kaiaClaim.row.servicePeriodStart) === "2026-07-19" && kaiaClaim.row.claimedCents === 13_500 && kaiaClaim.line.serviceUnits === 1 && kaiaClaim.line.amountCents === 13_500 && hasWorkbookEvidence(kaiaClaim.row.customFields, "July 12-26", 4), "Kaia claim correction and workbook provenance were not preserved.");
}

function evidence(previous: Prisma.InputJsonObject, workbookSource: Prisma.InputJsonObject): Prisma.InputJsonObject {
  return {
    reconciliation: {
      source: "director_email_attachment",
      receivedAt: "2026-08-26T14:36:41.000Z",
      workbook: workbookSource,
      previous,
      remittancePosted: false,
      claimMarkedPaid: false,
      parentBalanceChanged: false,
      holdReason: "Tyler Technologies remittance transaction/reference ID was not supplied.",
    },
  };
}

async function apply(expectedFingerprint: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "SubsidyAuthorization" WHERE "centerId" = ${EXPECTED.centerId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "SubsidyClaim" WHERE "centerId" = ${EXPECTED.centerId} FOR UPDATE`;
    const before = await loadState(tx);
    verifyInitial(before);
    invariant(fingerprint(before) === expectedFingerprint, "Kokomo CCDF state changed inside the apply transaction; rerun the dry run.");
    const now = new Date();

    const authUpdates: Array<{ id: string; data: Prisma.SubsidyAuthorizationUpdateManyMutationInput }> = [
      {
        id: EXPECTED.kaiden.authorizationId,
        data: { familyCopayCents: 7_500, customFields: { ...object(authorization(before, EXPECTED.kaiden.authorizationId).customFields), ...evidence({ familyCopayCents: 0 }, source("July 12-26", 2, "2026-08-09", 13_500)) } },
      },
      {
        id: EXPECTED.kaia.authorizationId,
        data: { coverageStart: d("2026-07-19"), familyCopayCents: 7_500, customFields: { ...object(authorization(before, EXPECTED.kaia.authorizationId).customFields), ...evidence({ coverageStart: "2026-07-12", familyCopayCents: 0 }, source("July 12-26", 4, "2026-08-09", 13_500)) } },
      },
      {
        id: EXPECTED.wrenly.currentAuthorizationId,
        data: { coverageStart: d("2026-08-02"), customFields: { ...object(authorization(before, EXPECTED.wrenly.currentAuthorizationId).customFields), ...evidence({ coverageStart: "2026-08-03" }, source("July 26 - Aug 8", 2, "2026-08-23", 31_300)) } },
      },
      {
        id: EXPECTED.oakleigh.authorizationId,
        data: { authorizationNumber: EXPECTED.oakleigh.authorizationNumber, coverageStart: d("2026-07-19"), coverageEnd: d("2026-10-03"), customFields: { ...object(authorization(before, EXPECTED.oakleigh.authorizationId).customFields), ...evidence({ authorizationNumber: EXPECTED.oakleigh.previousAuthorizationNumber, coverageStart: "2026-08-02", coverageEnd: "2026-10-10" }, source("July 26 - Aug 8", 3, "2026-08-23", 38_200)) } },
      },
      {
        id: EXPECTED.lyla.authorizationId,
        data: { authorizationNumber: EXPECTED.lyla.authorizationNumber, customFields: { ...object(authorization(before, EXPECTED.lyla.authorizationId).customFields), ...evidence({ authorizationNumber: EXPECTED.lyla.previousAuthorizationNumber }, source("July 26 - Aug 8", 4, "2026-08-23", 38_700)) } },
      },
    ];

    for (const item of authUpdates) {
      const updated = await tx.subsidyAuthorization.updateMany({ where: { id: item.id, centerId: EXPECTED.centerId, agencyProgramId: EXPECTED.programId }, data: item.data });
      invariant(updated.count === 1, `Authorization ${item.id} changed before update.`);
      await tx.auditLog.create({ data: { tenantId: EXPECTED.tenantId, centerId: EXPECTED.centerId, userId: before.actor.id, action: "billing.subsidy_authorization.corrected_from_director_workbook", resource: "SubsidyAuthorization", resourceId: item.id, metadata: { evidenceMessageId: EXPECTED.evidenceMessageId, evidenceSha256: EXPECTED.evidenceSha256, appliedAt: now.toISOString(), sourceFingerprint: expectedFingerprint, remittancePosted: false, parentBalanceChanged: false } } });
    }

    const historicalWrenly = await tx.subsidyAuthorization.create({
      data: {
        centerId: EXPECTED.centerId,
        agencyProgramId: EXPECTED.programId,
        familyId: EXPECTED.wrenly.familyId,
        childId: EXPECTED.wrenly.childId,
        authorizationNumber: EXPECTED.wrenly.historicalAuthorizationNumber,
        coverageStart: d("2026-07-12"),
        coverageEnd: d("2026-07-18"),
        authorizedRateCents: 31_300,
        familyCopayCents: 0,
        unitType: "weekly",
        authorizedUnits: null,
        status: "active",
        requiredDocuments: [],
        customFields: evidence({}, source("July 12-26", 3, "2026-08-09", 31_300)),
      },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { tenantId: EXPECTED.tenantId, centerId: EXPECTED.centerId, userId: before.actor.id, action: "billing.subsidy_authorization.created_from_director_workbook", resource: "SubsidyAuthorization", resourceId: historicalWrenly.id, metadata: { evidenceMessageId: EXPECTED.evidenceMessageId, evidenceSha256: EXPECTED.evidenceSha256, appliedAt: now.toISOString(), sourceFingerprint: expectedFingerprint, remittancePosted: false, parentBalanceChanged: false } } });

    const kaidenClaimBefore = claim(before, EXPECTED.kaiden.claimId, EXPECTED.kaiden.lineId, EXPECTED.kaiden.authorizationId, EXPECTED.kaiden.childId);
    const kaidenClaimUpdate = await tx.subsidyClaim.updateMany({ where: { id: EXPECTED.kaiden.claimId, centerId: EXPECTED.centerId, agencyProgramId: EXPECTED.programId, authorizationId: EXPECTED.kaiden.authorizationId, status: "draft" }, data: { claimedCents: 13_500, customFields: { ...object(kaidenClaimBefore.row.customFields), ...evidence({ claimedCents: 27_000, serviceUnits: 2, lineAmountCents: 27_000 }, source("July 12-26", 2, "2026-08-09", 13_500)) } } });
    invariant(kaidenClaimUpdate.count === 1, "Kaiden claim changed scope or status before update.");
    const kaidenLineUpdate = await tx.subsidyClaimLine.updateMany({ where: { id: EXPECTED.kaiden.lineId, claimId: EXPECTED.kaiden.claimId, childId: EXPECTED.kaiden.childId }, data: { serviceUnits: 1, amountCents: 13_500 } });
    invariant(kaidenLineUpdate.count === 1, "Kaiden claim line changed scope before update.");

    const kaiaClaimBefore = claim(before, EXPECTED.kaia.claimId, EXPECTED.kaia.lineId, EXPECTED.kaia.authorizationId, EXPECTED.kaia.childId);
    const kaiaClaimUpdate = await tx.subsidyClaim.updateMany({ where: { id: EXPECTED.kaia.claimId, centerId: EXPECTED.centerId, agencyProgramId: EXPECTED.programId, authorizationId: EXPECTED.kaia.authorizationId, status: "draft" }, data: { servicePeriodStart: d("2026-07-19"), claimedCents: 13_500, customFields: { ...object(kaiaClaimBefore.row.customFields), ...evidence({ servicePeriodStart: "2026-07-12", claimedCents: 27_000, serviceUnits: 2, lineAmountCents: 27_000 }, source("July 12-26", 4, "2026-08-09", 13_500)) } } });
    invariant(kaiaClaimUpdate.count === 1, "Kaia claim changed scope or status before update.");
    const kaiaLineUpdate = await tx.subsidyClaimLine.updateMany({ where: { id: EXPECTED.kaia.lineId, claimId: EXPECTED.kaia.claimId, childId: EXPECTED.kaia.childId }, data: { serviceUnits: 1, amountCents: 13_500 } });
    invariant(kaiaLineUpdate.count === 1, "Kaia claim line changed scope before update.");

    for (const claimId of [EXPECTED.kaiden.claimId, EXPECTED.kaia.claimId]) {
      await tx.auditLog.create({ data: { tenantId: EXPECTED.tenantId, centerId: EXPECTED.centerId, userId: before.actor.id, action: "billing.subsidy_claim.draft_corrected_from_director_workbook", resource: "SubsidyClaim", resourceId: claimId, metadata: { evidenceMessageId: EXPECTED.evidenceMessageId, evidenceSha256: EXPECTED.evidenceSha256, appliedAt: now.toISOString(), sourceFingerprint: expectedFingerprint, statusPreserved: "draft", remittancePosted: false, paidCentsPreserved: 0, parentBalanceChanged: false } } });
    }

    const after = await loadState(tx);
    verifyFinal(after);
    return { after, historicalWrenlyId: historicalWrenly.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

async function main() {
  const before = await loadState();
  const alreadyApplied = (() => {
    try { verifyFinal(before); return true; } catch { return false; }
  })();
  const currentFingerprint = fingerprint(before);

  if (!process.argv.includes(APPLY)) {
    if (!alreadyApplied) verifyInitial(before);
    console.log(JSON.stringify({
      mode: "dry-run",
      fingerprint: currentFingerprint,
      alreadyApplied,
      corrections: {
        authorizationUpdates: 5,
        historicalAuthorizationCreates: alreadyApplied ? 0 : 1,
        draftClaimUpdates: 2,
      },
      boundaries: {
        chargesCreated: 0, refundsCreated: 0, paymentsCreated: 0,
        remittancesCreated: 0, claimsMarkedPaid: 0, parentBalancesChanged: 0,
        invoicesChanged: 0, autopayChanged: 0, invitationsSent: 0,
      },
      remainingConfirmation: "Tyler Technologies remittance transaction/reference ID for each workbook payment row.",
    }, null, 2));
    return;
  }

  invariant(!alreadyApplied, "Kokomo workbook corrections are already applied; no additional mutation is needed.");
  const supplied = process.argv.find((value) => value.startsWith(FINGERPRINT_ARG))?.slice(FINGERPRINT_ARG.length) ?? "";
  invariant(supplied === currentFingerprint, `Apply requires ${FINGERPRINT_ARG}${currentFingerprint}`);
  const result = await apply(currentFingerprint);
  console.log(JSON.stringify({
    mode: "apply",
    fingerprint: currentFingerprint,
    historicalWrenlyAuthorizationId: result.historicalWrenlyId,
    verified: true,
    boundaries: {
      chargesCreated: 0, refundsCreated: 0, paymentsCreated: 0,
      remittancesCreated: 0, claimsMarkedPaid: 0, parentBalancesChanged: 0,
      invoicesChanged: 0, autopayChanged: 0, invitationsSent: 0,
    },
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
