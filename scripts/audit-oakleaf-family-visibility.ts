import "./load-env";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  hasConfirmedFamilyResponsibility,
  parentBalanceNeedsResponsibilityReview,
  parentVisibleBillingBalanceCents,
} from "@/lib/parent-billing-visibility";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedId(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function accountKey(value: string) {
  return value.match(/\[\*?([A-Z0-9_-]+)\*?\]/i)?.[1]?.toUpperCase() ?? "";
}

function moneyCents(value: string) {
  const normalized = value.trim().replace(/[,$()\s]/g, "");
  if (!/^[-+]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return /^\(.*\)$/.test(value.trim()) ? -cents : cents;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  invariant(!quoted, "Oakleaf source contains an unterminated quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function sourceAnnotations(path: string) {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const byAccount = new Map<string, Array<{ accountKey: string; payerName: string; weeklyCents: number | null; balanceCents: number | null; notes: string[] }>>();
  for (const row of rows) {
    const key = accountKey(row[9] ?? "");
    if (!key) continue;
    const notes = row.slice(17).map((item) => item.trim()).filter(Boolean);
    const item = {
      accountKey: key,
      payerName: (row[9] ?? "").replace(/^\s*\[\*?[A-Z0-9_-]+\*?\]\s*/i, "").replace(/\s+-\s+Hidden\s*$/i, "").trim(),
      weeklyCents: moneyCents(row[8] ?? ""),
      balanceCents: moneyCents(row[10] ?? ""),
      notes,
    };
    const existing = byAccount.get(key) ?? [];
    if (!existing.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item))) existing.push(item);
    byAccount.set(key, existing);
  }
  return byAccount;
}

async function main() {
  const sourcePath = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH);
  invariant(sourcePath, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const source = sourceAnnotations(sourcePath);
  const [center, families, importRows] = await Promise.all([
    prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true } }),
    prisma.family.findMany({
      where: { centerId: CENTER_ID, children: { some: currentlyEnrolledChildWhere() } },
      select: {
        id: true,
        name: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        createdAt: true,
        guardians: { select: { id: true, fullName: true, email: true, phone: true, userId: true, user: { select: { isActive: true } } } },
        children: {
          where: currentlyEnrolledChildWhere(),
          select: { id: true, fullName: true, dateOfBirth: true, sourceSystem: true, externalId: true, customFields: true, createdAt: true },
          orderBy: { fullName: "asc" },
        },
        billingAccount: {
          select: {
            id: true,
            balanceCents: true,
            customFields: true,
            invoices: { select: { id: true, createdAt: true } },
            payments: { select: { id: true, paidAt: true, status: true } },
            ledgerEntries: {
              orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
              select: { id: true, type: true, sourceSystem: true, amountCents: true, balanceAfterCents: true, effectiveAt: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.procareImportRow.findMany({
      where: { batch: { centerId: CENTER_ID }, createdFamilyId: { not: null } },
      select: { createdFamilyId: true, rawData: true },
    }),
  ]);
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center identity or status changed.");

  const importIds = new Map<string, Set<string>>();
  for (const row of importRows) {
    if (!row.createdFamilyId) continue;
    const values = object(row.rawData);
    const ids = importIds.get(row.createdFamilyId) ?? new Set<string>();
    for (const key of ["account key", "account id", "account number", "family id", "procare account id"]) {
      const value = normalizedId(values[key]);
      if (value) ids.add(value);
    }
    importIds.set(row.createdFamilyId, ids);
  }

  const records = families.map((family) => {
    const familyFields = object(family.customFields);
    const keys = [...new Set([
      normalizedId(family.externalId),
      normalizedId(familyFields.procareAccountKey),
      normalizedId(familyFields.sourceAccountId),
      normalizedId(familyFields.procareAccountId),
      ...(importIds.get(family.id) ?? []),
    ].filter(Boolean))];
    const annotations = keys.flatMap((key) => source.get(key) ?? []);
    const account = family.billingAccount;
    const latestLedger = account?.ledgerEntries.find((entry) => entry.balanceAfterCents !== null) ?? null;
    const agencyLedgerEntries = account?.ledgerEntries.filter((entry) =>
      ["agency_payment", "agency_receivable", "agency_voucher_credit", "subsidy_payment", "subsidy_receivable"].includes(entry.type.toLowerCase())
      || entry.sourceSystem?.toLowerCase() === "subsidy_agency") ?? [];
    const parentVisibleBalanceCents = account ? parentVisibleBillingBalanceCents({ accountBalanceCents: account.balanceCents, agencyLedgerEntries }) : 0;
    const responsibilityReviewRequired = account ? parentBalanceNeedsResponsibilityReview({
      accountBalanceCents: account.balanceCents,
      agencyLedgerEntries,
      responsibilityEvidence: [account.customFields, family.customFields, ...family.children.map((child) => child.customFields)],
    }) : false;
    const visibilityConfirmed = account ? hasConfirmedFamilyResponsibility(account.balanceCents, latestLedger?.id ?? null, account.customFields) : false;
    const reconciliation = object(object(account?.customFields).oakleafBalanceReconciliation as Prisma.JsonValue | null | undefined);
    const children = family.children.map((child) => {
      const fields = object(child.customFields);
      return {
        id: child.id,
        name: child.fullName,
        enabled: fields.tuitionBillingEnabled === true,
        savedWeeklyCents: Number(fields.tuitionPlanAmountCents ?? 0),
        planId: clean(fields.tuitionPlanId),
        fundingType: clean(fields.tuitionFundingType),
      };
    });
    return {
      familyId: family.id,
      familyName: family.name,
      familyCreatedAt: family.createdAt,
      familySourceSystem: family.sourceSystem,
      sourceKeys: keys,
      sourceAnnotations: annotations,
      children,
      guardianCount: family.guardians.length,
      guardianNames: family.guardians.map((guardian) => guardian.fullName),
      guardianEmailReady: family.guardians.map((guardian) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(guardian.email))),
      guardianEmails: family.guardians.map((guardian) => clean(guardian.email).toLowerCase()).filter(Boolean),
      guardianPhoneReady: family.guardians.map((guardian) => clean(guardian.phone).replace(/\D/g, "").length >= 4),
      activeLinkedGuardianCount: family.guardians.filter((guardian) => guardian.userId && guardian.user?.isActive).length,
      directorBalanceCents: account?.balanceCents ?? 0,
      latestLedgerBalanceCents: latestLedger?.balanceAfterCents ?? null,
      parentVisibleBalanceCents: responsibilityReviewRequired && !visibilityConfirmed ? 0 : parentVisibleBalanceCents,
      rawParentProjectionCents: parentVisibleBalanceCents,
      responsibilityReviewRequired,
      visibilityConfirmed,
      invoiceCount: account?.invoices.length ?? 0,
      paymentCount: account?.payments.length ?? 0,
      reconciliationSourceSha256: clean(reconciliation.sourceSha256),
      reconciledOpeningBalanceCents: Number(reconciliation.reconciledBalanceCents ?? Number.NaN),
    };
  });

  const allSourceAnnotations = [...source.values()].flat();
  const unconfiguredChildren = records.flatMap((record) => record.children
    .filter((child) => !child.enabled || child.savedWeeklyCents <= 0 || !child.planId)
    .map((child) => {
      const childTokens = child.name.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 4) ?? [];
      const familyTokens = record.familyName.toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 4 && token !== "family") ?? [];
      const manualSourceCandidates = allSourceAnnotations.filter((annotation) => {
        const haystack = `${annotation.payerName} ${annotation.notes.join(" ")}`.toLowerCase();
        return childTokens.some((token) => haystack.includes(token)) || familyTokens.some((token) => haystack.includes(token));
      });
      return ({
      familyId: record.familyId,
      familyName: record.familyName,
      childId: child.id,
      childName: child.name,
      sourceKeys: record.sourceKeys,
      sourceAnnotations: record.sourceAnnotations,
      manualSourceCandidates,
      guardianNames: record.guardianNames,
      directorBalanceCents: record.directorBalanceCents,
      latestLedgerBalanceCents: record.latestLedgerBalanceCents,
      current: child,
    });
    }));
  const ledgerMismatches = records.filter((record) => record.latestLedgerBalanceCents !== null && record.latestLedgerBalanceCents !== record.directorBalanceCents);
  const parentVisibilityHolds = records.filter((record) => record.responsibilityReviewRequired && !record.visibilityConfirmed);
  const noActiveParentAccess = records.filter((record) => record.activeLinkedGuardianCount === 0);
  const sourceReconciliationIssues = records.filter((record) => {
    if (!record.reconciliationSourceSha256) return false;
    return record.reconciliationSourceSha256 !== SOURCE_SHA256 || !Number.isInteger(record.reconciledOpeningBalanceCents);
  });
  const unconfiguredNames = new Set(unconfiguredChildren.map((item) => item.childName.trim().toLowerCase()));
  const guardianEmails = [...new Set(noActiveParentAccess.flatMap((record) => record.guardianEmails))];
  const [sameNameChildren, matchingUsers] = await Promise.all([
    prisma.child.findMany({
      where: { family: { centerId: CENTER_ID }, fullName: { in: unconfiguredChildren.map((item) => item.childName) } },
      select: {
        id: true,
        fullName: true,
        dateOfBirth: true,
        enrollmentStatus: true,
        classroomId: true,
        sourceSystem: true,
        externalId: true,
        createdAt: true,
        family: { select: { id: true, name: true, externalId: true, sourceSystem: true, createdAt: true } },
      },
      orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({
      where: { email: { in: guardianEmails, mode: "insensitive" } },
      select: { id: true, email: true, role: true, isActive: true, tenantId: true, guardians: { select: { id: true, familyId: true } } },
    }),
  ]);
  invariant(sameNameChildren.every((child) => unconfiguredNames.has(child.fullName.trim().toLowerCase())), "Unexpected child-name match escaped the Oakleaf audit scope.");

  console.log(JSON.stringify({
    asOf: new Date().toISOString(),
    center,
    source: { sha256: SOURCE_SHA256, annotatedAccounts: source.size },
    summary: {
      currentFamilies: records.length,
      currentChildren: records.reduce((sum, record) => sum + record.children.length, 0),
      configuredChildren: records.reduce((sum, record) => sum + record.children.filter((child) => child.enabled && child.savedWeeklyCents > 0 && child.planId).length, 0),
      unconfiguredChildren: unconfiguredChildren.length,
      directorBalanceCents: records.reduce((sum, record) => sum + record.directorBalanceCents, 0),
      parentVisibleBalanceCents: records.reduce((sum, record) => sum + record.parentVisibleBalanceCents, 0),
      ledgerMismatches: ledgerMismatches.length,
      parentVisibilityHolds: parentVisibilityHolds.length,
      familiesWithoutActiveParentAccess: noActiveParentAccess.length,
      sourceReconciliationIssues: sourceReconciliationIssues.length,
    },
    exceptions: {
      unconfiguredChildren,
      ledgerMismatches: ledgerMismatches.map((record) => ({ familyId: record.familyId, familyName: record.familyName, directorBalanceCents: record.directorBalanceCents, latestLedgerBalanceCents: record.latestLedgerBalanceCents })),
      parentVisibilityHolds: parentVisibilityHolds.map((record) => ({ familyId: record.familyId, familyName: record.familyName, directorBalanceCents: record.directorBalanceCents, rawParentProjectionCents: record.rawParentProjectionCents, sourceAnnotations: record.sourceAnnotations })),
      noActiveParentAccess: noActiveParentAccess.map((record) => ({ familyId: record.familyId, familyName: record.familyName, guardianCount: record.guardianCount, guardianNames: record.guardianNames, guardianEmailReady: record.guardianEmailReady, guardianPhoneReady: record.guardianPhoneReady })),
      exactNameChildRecords: sameNameChildren,
      existingUsersForUnlinkedGuardians: noActiveParentAccess.map((record) => ({
        familyId: record.familyId,
        familyName: record.familyName,
        guardianCount: record.guardianCount,
        matchingUsers: matchingUsers
          .filter((user) => record.guardianEmails.includes(user.email.toLowerCase()))
          .map((user) => ({ id: user.id, role: user.role, isActive: user.isActive, alreadyLinkedFamilyIds: user.guardians.map((guardian) => guardian.familyId) })),
      })),
      sourceReconciliationIssues: sourceReconciliationIssues.map((record) => ({
        familyId: record.familyId,
        familyName: record.familyName,
        sourceKeys: record.sourceKeys,
        sourceAnnotations: record.sourceAnnotations,
        directorBalanceCents: record.directorBalanceCents,
        latestLedgerBalanceCents: record.latestLedgerBalanceCents,
        invoiceCount: record.invoiceCount,
        paymentCount: record.paymentCount,
        reconciliationSourceSha256: record.reconciliationSourceSha256,
        reconciledOpeningBalanceCents: record.reconciledOpeningBalanceCents,
      })),
    },
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
