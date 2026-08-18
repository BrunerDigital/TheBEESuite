import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import {
  nextWeeklyBillingPeriod,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const SOURCE_AS_OF = "2026-08-02";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-family-visibility";
const FINGERPRINT = "--confirm-fingerprint=";

const targets = [
  {
    familyId: "cmsnpr9tg000yjl04tjw8q3s9",
    familyName: "Barnhart Family",
    childId: "cmsnpraaf0012jl04zpc72cai",
    childName: "Riley Barnhart",
    guardianName: "Mariah Barnhart",
    accountKey: "BARNHART",
    sourcePayer: "Barnhart, Mariah",
    sourceBalanceCents: 0,
    weeklyCents: null,
    fundingType: null,
    evidence: "Oakleaf August 2 account summary matches guardian Mariah Barnhart and shows a $0 balance, but no weekly rate.",
  },
  {
    familyId: "cmsnpty8y001djl04y0745dtf",
    familyName: "Correra Family",
    childId: "cmsnptypy001hjl04s6hlyeng",
    childName: "Zenari Saunders",
    guardianName: "Katherine Correra",
    accountKey: "SAUNDER",
    sourcePayer: "Correa, Katherine",
    sourceBalanceCents: 0,
    weeklyCents: 13_000,
    fundingType: "family",
    evidence: "Oakleaf August 2 account summary identifies Zenari, guardian Katherine Correa/Correra, $130 weekly, subsidy family (VPK), and a $0 opening balance.",
  },
  {
    familyId: "cmsnpvxe4001ojl042ys18sih",
    familyName: "Nsairat Family",
    childId: "cmsnpvxvi001sjl049f4rneat",
    childName: "Zaina Abu Nabaout",
    guardianName: "Fatima Al Nsairat",
    accountKey: "NSAIRAT",
    sourcePayer: "Al Nsairat, Fatima",
    sourceBalanceCents: 0,
    weeklyCents: 0,
    fundingType: "voucher",
    evidence: "Oakleaf August 2 account summary matches guardian Fatima Al Nsairat and states VPK-only with no private charges and a $0 opening balance.",
  },
] as const;

const holds = [
  {
    familyId: "cmsnpjiez0004l1046gilrn04",
    familyName: "Balais Family",
    childId: "cmsnpjivt0008l104nex41zor",
    childName: "Delani Simon",
    reason: "Family was created after the August 2 Oakleaf source and has no reviewed weekly rate or prior-balance row.",
  },
  {
    familyId: "cmsnpr9tg000yjl04tjw8q3s9",
    familyName: "Barnhart Family",
    childId: "cmsnpraaf0012jl04zpc72cai",
    childName: "Riley Barnhart",
    reason: "The exact Oakleaf source row confirms a $0 opening balance but contains no weekly rate.",
  },
  {
    familyId: "cmsnpo2jd000fjl04cl5pvi17",
    familyName: "Cadet Family",
    childId: "cmsnpo30h000jjl04ozmklivw",
    childName: "Sarah Cadet",
    reason: "Family was created after the August 2 Oakleaf source and has no reviewed weekly rate or prior-balance row.",
  },
  {
    familyId: "cmsnq0nuc0000k104o3m4ovnf",
    familyName: "Dorcent Family",
    childId: "cmsnq0ob50004k10423976k69",
    childName: "Brianna Dorcent",
    reason: "Family was created after the August 2 Oakleaf source and has no reviewed weekly rate or prior-balance row.",
  },
] as const;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function inputObject(value: Prisma.JsonObject) {
  return value as Prisma.InputJsonObject;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function sourceEvidence() {
  const path = process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH?.trim() ?? "";
  invariant(path, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const buffer = readFileSync(path);
  invariant(createHash("sha256").update(buffer).digest("hex") === SOURCE_SHA256, "Oakleaf source fingerprint changed.");
  const text = buffer.toString("utf8");
  for (const target of targets) {
    invariant(text.includes(`[${target.accountKey}]`) || text.includes(`[${target.accountKey}*]`) || text.includes(`[${target.accountKey}*`), `${target.accountKey} source row is missing.`);
    invariant(text.toLowerCase().includes(target.sourcePayer.toLowerCase()), `${target.sourcePayer} source identity is missing.`);
  }
  invariant(text.includes("$130.00") && text.toLowerCase().includes("zenari - subsidy family (vpk)"), "Zenari's reviewed $130 weekly annotation is missing.");
  invariant(text.toLowerCase().includes("vpk only child no private charges"), "Nsairat's $0 VPK-only annotation is missing.");
  return { path, sha256: SOURCE_SHA256, asOf: SOURCE_AS_OF };
}

async function loadState() {
  const familyIds = [...new Set([...targets, ...holds].map((target) => target.familyId))];
  const childIds = [...new Set([...targets, ...holds].map((target) => target.childId))];
  const [center, families, children, allAccounts, allInvoices, allPayments, allLedgerEntries] = await Promise.all([
    prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } } }),
    prisma.family.findMany({
      where: { id: { in: familyIds } },
      select: {
        id: true,
        name: true,
        centerId: true,
        customFields: true,
        guardians: { select: { fullName: true } },
        billingAccount: { select: { id: true, balanceCents: true, customFields: true, invoices: { select: { id: true } }, payments: { select: { id: true } } } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.child.findMany({
      where: { id: { in: childIds } },
      select: { id: true, familyId: true, fullName: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true },
      orderBy: { id: "asc" },
    }),
    prisma.billingAccount.findMany({ where: { family: { centerId: CENTER_ID } }, select: { id: true, familyId: true, balanceCents: true }, orderBy: { id: "asc" } }),
    prisma.invoice.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.payment.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.ledgerEntry.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
  ]);
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center identity or status changed.");
  invariant(families.length === familyIds.length && children.length === childIds.length, "An Oakleaf target family or child is missing.");
  for (const target of [...targets, ...holds]) {
    const family = families.find((item) => item.id === target.familyId);
    const child = children.find((item) => item.id === target.childId);
    invariant(family?.name === target.familyName && family.centerId === CENTER_ID, `${target.familyName} identity changed.`);
    invariant(child?.familyId === target.familyId && child.fullName === target.childName, `${target.childName} identity changed.`);
    invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus) && child.classroomId, `${target.childName} is no longer currently enrolled.`);
    invariant(family.billingAccount && family.billingAccount.balanceCents === 0, `${target.familyName} no longer has the reviewed $0 balance.`);
  }
  for (const target of targets) {
    const family = families.find((item) => item.id === target.familyId)!;
    invariant(family.guardians.some((guardian) => guardian.fullName.trim().toLowerCase() === target.guardianName.toLowerCase()), `${target.guardianName} is no longer linked to ${target.familyName}.`);
  }
  const startsPeriod = nextWeeklyBillingPeriod(new Date());
  const state = {
    startsPeriod,
    families,
    children,
    accountBalances: allAccounts.map((account) => ({ id: account.id, familyId: account.familyId, balanceCents: account.balanceCents })),
    invoiceIds: allInvoices.map((invoice) => invoice.id),
    paymentIds: allPayments.map((payment) => payment.id),
    ledgerEntryIds: allLedgerEntries.map((entry) => entry.id),
  };
  return { center, state, fingerprint: fingerprint({ sourceSha256: SOURCE_SHA256, targets, holds, state }) };
}

async function apply(before: Awaited<ReturnType<typeof loadState>>) {
  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user?.tenantId === before.center.organization.tenantId, "Oakleaf audit-user attribution changed.");
  let assignmentsUpdated = 0;
  let holdsUpdated = 0;
  let plansCreated = 0;
  let sourceLinksUpdated = 0;
  for (const target of targets) {
    const childBefore = before.state.children.find((child) => child.id === target.childId)!;
    await prisma.$transaction(async (tx) => {
      const family = await tx.family.findUnique({ where: { id: target.familyId }, select: { name: true, centerId: true, customFields: true, billingAccount: { select: { balanceCents: true, customFields: true } }, guardians: { select: { fullName: true } } } });
      const child = await tx.child.findUnique({ where: { id: target.childId }, select: { familyId: true, fullName: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true } });
      invariant(family?.name === target.familyName && family.centerId === CENTER_ID && family.billingAccount?.balanceCents === 0, `${target.familyName} changed during apply.`);
      invariant(family.guardians.some((guardian) => guardian.fullName.trim().toLowerCase() === target.guardianName.toLowerCase()), `${target.guardianName} changed during apply.`);
      invariant(child?.familyId === target.familyId && child.fullName === target.childName && ["enrolled", "active", "current"].includes(child.enrollmentStatus) && child.classroomId, `${target.childName} changed during apply.`);
      const familyFields = object(family.customFields);
      await tx.family.update({
        where: { id: target.familyId },
        data: { customFields: inputObject({
          ...familyFields,
          procareAccountKey: target.accountKey,
          oakleafSourceAccountEvidence: {
            sourceSha256: SOURCE_SHA256,
            sourceAsOf: SOURCE_AS_OF,
            accountKey: target.accountKey,
            payerName: target.sourcePayer,
            guardianName: target.guardianName,
            childName: target.childName,
            openingBalanceCents: target.sourceBalanceCents,
            evidence: target.evidence,
          },
        }) },
      });
      sourceLinksUpdated += 1;
      if (target.weeklyCents === null || !target.fundingType) {
        await tx.auditLog.create({ data: { tenantId: user.tenantId, centerId: CENTER_ID, userId: user.id, action: "family.source_account.reconciled", resource: "Family", resourceId: target.familyId, metadata: { accountKey: target.accountKey, sourceSha256: SOURCE_SHA256, sourceAsOf: SOURCE_AS_OF, openingBalanceCents: target.sourceBalanceCents, weeklyRateHeld: true, balanceChanged: false, invoiceCreated: false, paymentSubmitted: false } } });
        return;
      }
      const matchingPlans = await tx.tuitionPlan.findMany({ where: { centerId: CENTER_ID, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: target.weeklyCents, ageGroup: child.ageGroup }, orderBy: { id: "asc" } });
      invariant(matchingPlans.length <= 1, `${target.childName} gained multiple matching tuition plans.`);
      let plan = matchingPlans[0];
      if (!plan) {
        const name = target.weeklyCents === 0 ? "Oakleaf VPK only - $0 family responsibility" : `Oakleaf VPK subsidy weekly tuition - $${(target.weeklyCents / 100).toFixed(2)}`;
        plan = await tx.tuitionPlan.create({ data: { centerId: CENTER_ID, name, ageGroup: child.ageGroup, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: target.weeklyCents } });
        plansCreated += 1;
      }
      const fields = object(child.customFields);
      const updatedAt = new Date().toISOString();
      await tx.child.update({ where: { id: target.childId }, data: { customFields: inputObject({
        ...fields,
        accountExternalId: target.accountKey,
        tuitionBillingEnabled: true,
        tuitionPlanId: plan.id,
        tuitionPlanName: plan.name,
        tuitionPlanAgeGroup: plan.ageGroup,
        tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
        tuitionBillingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
        tuitionPlanAmountCents: plan.amountCents,
        tuitionCredits: [],
        tuitionCreditsTotalCents: 0,
        tuitionNetAmountCents: plan.amountCents,
        tuitionFundingType: target.fundingType,
        tuitionAutobillEligible: target.fundingType === "family",
        tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
        tuitionBillingStartsPeriod: before.state.startsPeriod,
        tuitionBillingDescription: plan.name,
        tuitionBillingUpdatedAt: updatedAt,
        tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf current-family visibility 2026-08-18",
        tuitionRateEvidence: { source: "oakleaf_account_balance_summary", sourceSha256: SOURCE_SHA256, sourceAsOf: SOURCE_AS_OF, accountKey: target.accountKey, note: target.evidence },
      }) } });
      const accountFields = object(family.billingAccount.customFields);
      await tx.billingAccount.update({
        where: { familyId: target.familyId },
        data: { customFields: inputObject({
          ...accountFields,
          tuitionAutobillEnabled: target.fundingType === "family",
          tuitionAutobillCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
          tuitionAutobillBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
          tuitionAutobillStartsPeriod: before.state.startsPeriod,
          tuitionAutobillPlanId: plan.id,
          tuitionAutobillPlanName: plan.name,
          tuitionAutobillAmountCents: plan.amountCents,
          tuitionAutobillUpdatedAt: updatedAt,
          tuitionAutobillUpdatedBy: "Brenden Bruner - Oakleaf current-family visibility 2026-08-18",
        }) },
      });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, centerId: CENTER_ID, userId: user.id, action: "billing.tuition_assignment.source_reconciled", resource: "Child", resourceId: target.childId, metadata: { familyId: target.familyId, accountKey: target.accountKey, amountCents: target.weeklyCents, fundingType: target.fundingType, startsPeriod: before.state.startsPeriod, sourceSha256: SOURCE_SHA256, sourceAsOf: SOURCE_AS_OF, balanceChanged: false, invoiceCreated: false, paymentSubmitted: false } } });
      assignmentsUpdated += 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
    invariant(childBefore.id === target.childId, `${target.childName} snapshot changed unexpectedly.`);
  }
  for (const target of holds) {
    await prisma.$transaction(async (tx) => {
      const family = await tx.family.findUnique({ where: { id: target.familyId }, select: { name: true, centerId: true, billingAccount: { select: { balanceCents: true } } } });
      const child = await tx.child.findUnique({ where: { id: target.childId }, select: { familyId: true, fullName: true, customFields: true } });
      invariant(family?.name === target.familyName && family.centerId === CENTER_ID && family.billingAccount?.balanceCents === 0, `${target.familyName} changed during hold apply.`);
      invariant(child?.familyId === target.familyId && child.fullName === target.childName, `${target.childName} changed during hold apply.`);
      const fields = object(child.customFields);
      const alreadyExact = fields.tuitionBillingEnabled === false && fields.tuitionAutobillEligible === false && fields.tuitionBillingHoldReason === target.reason;
      if (alreadyExact) return;
      const updatedAt = new Date().toISOString();
      await tx.child.update({ where: { id: target.childId }, data: { customFields: inputObject({ ...fields, tuitionBillingEnabled: false, tuitionAutobillEligible: false, tuitionBillingHoldReason: target.reason, tuitionBillingUpdatedAt: updatedAt, tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf current-family visibility 2026-08-18" }) } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, centerId: CENTER_ID, userId: user.id, action: "billing.tuition_assignment.source_hold", resource: "Child", resourceId: target.childId, metadata: { familyId: target.familyId, reason: target.reason, sourceSha256: SOURCE_SHA256, sourceAsOf: SOURCE_AS_OF, balanceChanged: false, invoiceCreated: false, paymentSubmitted: false } } });
      holdsUpdated += 1;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }
  return { sourceLinksUpdated, assignmentsUpdated, holdsUpdated, plansCreated };
}

async function verifyFinancialBoundaries(before: Awaited<ReturnType<typeof loadState>>) {
  const after = await loadState();
  invariant(JSON.stringify(after.state.accountBalances) === JSON.stringify(before.state.accountBalances), "An Oakleaf balance changed during visibility reconciliation.");
  invariant(JSON.stringify(after.state.invoiceIds) === JSON.stringify(before.state.invoiceIds), "An Oakleaf invoice changed during visibility reconciliation.");
  invariant(JSON.stringify(after.state.paymentIds) === JSON.stringify(before.state.paymentIds), "An Oakleaf payment changed during visibility reconciliation.");
  invariant(JSON.stringify(after.state.ledgerEntryIds) === JSON.stringify(before.state.ledgerEntryIds), "An Oakleaf ledger entry changed during visibility reconciliation.");
  for (const target of targets) {
    const family = after.state.families.find((item) => item.id === target.familyId)!;
    const child = after.state.children.find((item) => item.id === target.childId)!;
    const familyFields = object(family.customFields);
    const childFields = object(child.customFields);
    invariant(object(familyFields.oakleafSourceAccountEvidence as Prisma.JsonValue | null | undefined).sourceSha256 === SOURCE_SHA256, `${target.familyName} source evidence was not stored.`);
    if (target.weeklyCents !== null) {
      invariant(childFields.tuitionBillingEnabled === true && childFields.tuitionPlanAmountCents === target.weeklyCents && childFields.tuitionBillingStartsPeriod === before.state.startsPeriod, `${target.childName} weekly visibility is not exact.`);
    }
  }
  for (const target of holds) {
    const child = after.state.children.find((item) => item.id === target.childId)!;
    const fields = object(child.customFields);
    invariant(fields.tuitionBillingEnabled === false && fields.tuitionBillingHoldReason === target.reason, `${target.childName} hold is not exact.`);
  }
  return after;
}

async function main() {
  const evidence = sourceEvidence();
  const before = await loadState();
  const applyRequested = process.argv.includes(APPLY);
  console.log(JSON.stringify({
    mode: applyRequested ? "apply-preflight" : "dry-run",
    center: { id: before.center.id, name: before.center.name, status: before.center.status },
    source: evidence,
    fingerprint: before.fingerprint,
    startsPeriod: before.state.startsPeriod,
    assignments: targets.filter((target) => target.weeklyCents !== null).map((target) => ({ familyName: target.familyName, childName: target.childName, weeklyCents: target.weeklyCents, fundingType: target.fundingType })),
    holds,
    financialBoundaries: { balancesToChange: 0, invoicesToCreate: 0, paymentsToSubmit: 0, ledgerEntriesToCreate: 0 },
  }, null, 2));
  if (!applyRequested) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = process.argv.find((arg) => arg.startsWith(FINGERPRINT))?.slice(FINGERPRINT.length) ?? "";
  invariant(expectedFingerprint === before.fingerprint, "Oakleaf state changed; rerun the dry run and review the new fingerprint.");
  const result = await apply(before);
  await verifyFinancialBoundaries(before);
  console.log(JSON.stringify({ ok: true, result, startsPeriod: before.state.startsPeriod, balancesChanged: 0, invoicesCreated: 0, paymentsSubmitted: 0, ledgerEntriesCreated: 0 }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
