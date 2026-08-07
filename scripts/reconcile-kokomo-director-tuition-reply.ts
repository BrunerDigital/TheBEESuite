import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { WEEKLY_TUITION_AUTOBILL_DAY } from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ewela003u6alw9ii7uffs";
const PERIOD = "2026-W33";
const APPLY = "--apply";
const CONFIRM = "--confirm-kokomo-director-reply";
const FP = "--confirm-fingerprint=";

type Assignment = {
  familyId: string;
  familyName: string;
  childId: string;
  childName: string;
  amountCents: number;
  startPeriod: string;
  planName: string;
  fundingType: "family" | "voucher";
  expectedW33Cents?: number;
  evidence: string;
};

const assignments: Assignment[] = [
  { familyId: "cms67ovy30000l5042vymf1n0", familyName: "Allen Family", childId: "cms67owhp0004l504anhwhhiv", childName: "Wren Cain", amountCents: 21000, startPeriod: "2027-W32", planName: "Wren Cain tuition after free year - $210.00", fundingType: "family", evidence: "Kokomo director Reply All 2026-08-07: won free tuition for one year; $210 weekly rate begins 2027-W32." },
  { familyId: "cmqjlh5p20000jv04t1pbdc3k", familyName: "Biddle Family", childId: "cmqjlriwm0004l504uz0o7tvz", childName: "Aria Biddle", amountCents: 0, startPeriod: PERIOD, planName: "Director child - $0 family responsibility", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: director child, free tuition." },
  { familyId: "cmqjlh5p20000jv04t1pbdc3k", familyName: "Biddle Family", childId: "cmqjly44n0001la04nq65u9k4", childName: "Hardin Biddle", amountCents: 0, startPeriod: PERIOD, planName: "Director child - $0 family responsibility", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: director child, free tuition." },
  { familyId: "cms80juyz000wjw04ickilfo5", familyName: "Blackburn Family", childId: "cms80jvj90010jw04c7xi0wc6", childName: "Axel Blackburn", amountCents: 18900, startPeriod: PERIOD, planName: "Blackburn weekly tuition - $189.00", fundingType: "family", expectedW33Cents: 18900, evidence: "Kokomo director Reply All 2026-08-07: $189 per child; existing W33 invoice confirmed." },
  { familyId: "cms80juyz000wjw04ickilfo5", familyName: "Blackburn Family", childId: "cms81vwfm000mju0424obtzh2", childName: "Reyna Blackburn", amountCents: 18900, startPeriod: PERIOD, planName: "Blackburn weekly tuition - $189.00", fundingType: "family", expectedW33Cents: 18900, evidence: "Kokomo director Reply All 2026-08-07: $189 per child; existing W33 invoice confirmed." },
  { familyId: "cms3pk9jf0000ju04l3yqwnh3", familyName: "Deeg Family", childId: "cms6ecqc10003js04uunoqljo", childName: "Wrenly Black", amountCents: 0, startPeriod: PERIOD, planName: "CCDF Parent Copay 0.00", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: CCDF $0 family responsibility." },
  { familyId: "cmry08d080000l304crb30swd", familyName: "Gifford Family", childId: "cmry08dnx0004l304pholx02b", childName: "Jayveair Tyler", amountCents: 0, startPeriod: PERIOD, planName: "CCDF Parent Copay 0.00", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: CCDF $0 family responsibility." },
  { familyId: "cmry08d080000l304crb30swd", familyName: "Gifford Family", childId: "cmry0e38p0001jt04l57n6acq", childName: "Lyla Gifford", amountCents: 0, startPeriod: PERIOD, planName: "CCDF Parent Copay 0.00", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: CCDF $0 family responsibility." },
  { familyId: "cmrxd8c0e0000kz04rgbyccfa", familyName: "Harris Family", childId: "cmrxdahjj000gkz049335px8x", childName: "Zeplin Harris", amountCents: 0, startPeriod: PERIOD, planName: "Sibling billed on another child - $0 additional", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: family rate is billed on Amora; do not double bill Zeplin." },
  { familyId: "cmr104zbc0000jm04arhp6ngj", familyName: "Hobbs Family", childId: "cmr104zvu0004jm04ueb4kymn", childName: "Aelyn Hobbs", amountCents: 0, startPeriod: PERIOD, planName: "Director child - $0 family responsibility", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: director child, free tuition." },
  { familyId: "cms9bgp5h000dl4047eifqzuy", familyName: "Starling Family", childId: "cms9ble220017l4045lmllkof", childName: "Kharlii Starling", amountCents: 0, startPeriod: PERIOD, planName: "CCDF Parent Copay 0.00", fundingType: "voucher", evidence: "Kokomo director Reply All 2026-08-07: CCDF $0 family responsibility." },
];

const holds = [
  { familyId: "cmqtfyupr0004jm04nz1tcpe8", familyName: "Jarrett Family", childId: "cmqtfyvab0008jm04h5b5gkp0", childName: "TJ Jarrett", reason: "Director confirmed withdrawn" },
  { familyId: "cmql6stw50000ih043tqrd1ge", familyName: "Stratton Family", childId: "cmsdo34al0001l304i99n6vtv", childName: "Kalvin Stratton", reason: "Director confirmed test account" },
  { familyId: "cmql6stw50000ih043tqrd1ge", familyName: "Stratton Family", childId: "cmql6sufs0004ih04jpull7kh", childName: "Kayleen Stratton", reason: "Director confirmed test account" },
] as const;

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function arg(prefix: string) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim(); }

async function loadState() {
  const school = await prisma.center.findUnique({ where: { id: CENTER_ID }, select: { name: true, status: true, customFields: true } });
  invariant(school && school.status !== "closed", "Kokomo center is not active.");
  const schoolFields = object(school.customFields);
  invariant(schoolFields.tuitionBillingEnabled === true && schoolFields.livePaymentsEnabled === true && schoolFields.stripeBillingApproved === true, "Kokomo billing approval is not active.");
  const ids = [...assignments.map((item) => item.childId), ...holds.map((item) => item.childId)];
  const children = await prisma.child.findMany({ where: { id: { in: ids } }, select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true, family: { select: { name: true, centerId: true, billingAccount: { select: { balanceCents: true } } } } } });
  invariant(children.length === ids.length, "A Kokomo target child is missing.");
  for (const item of [...assignments, ...holds]) {
    const child = children.find((value) => value.id === item.childId);
    invariant(child && child.familyId === item.familyId && child.family.name === item.familyName && child.family.centerId === CENTER_ID && child.fullName === item.childName, `${item.childName} identity or family scope changed.`);
  }
  for (const item of assignments) {
    const child = children.find((value) => value.id === item.childId)!;
    invariant(["enrolled", "active", "current"].includes(child.enrollmentStatus) && child.classroomId, `${item.childName} is not a current classroom-assigned child.`);
    const invoices = await prisma.invoice.findMany({ where: { billingAccount: { familyId: item.familyId }, status: { not: PaymentStatus.VOID }, customFields: { path: ["childId"], equals: item.childId } }, select: { totalCents: true, customFields: true } });
    const w33 = invoices.filter((invoice) => object(invoice.customFields).billingPeriod === PERIOD || object(invoice.customFields).coverageStartsPeriod === PERIOD);
    if (item.expectedW33Cents !== undefined) invariant(w33.length === 1 && w33[0].totalCents === item.expectedW33Cents, `${item.childName} W33 invoice changed.`);
    else invariant(w33.length === 0, `${item.childName} unexpectedly has a W33 invoice.`);
  }
  const snapshot = { school, assignments, holds, children };
  return { snapshot, fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

async function ensurePlan(item: Assignment) {
  const ageGroup = (await prisma.child.findUnique({ where: { id: item.childId }, select: { ageGroup: true } }))?.ageGroup || "Preschool";
  const existing = await prisma.tuitionPlan.findFirst({ where: { centerId: CENTER_ID, name: item.planName, amountCents: item.amountCents, cadence: "weekly" }, orderBy: { id: "asc" } });
  return existing || prisma.tuitionPlan.create({ data: { centerId: CENTER_ID, name: item.planName, ageGroup, cadence: "weekly", amountCents: item.amountCents } });
}

async function main() {
  const before = await loadState();
  const apply = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", fingerprint: before.fingerprint, assignments: assignments.map(({ familyName, childName, amountCents, startPeriod, evidence }) => ({ familyName, childName, amountCents, startPeriod, evidence })), holds }, null, 2));
  if (!apply) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(arg(FP) === before.fingerprint, "Kokomo review state changed; rerun the dry run.");
  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user, "Brenden audit user was not found.");
  const balanceBefore = new Map(before.snapshot.children.map((child) => [child.familyId, child.family.billingAccount?.balanceCents ?? 0]));

  for (const item of assignments) {
    const plan = await ensurePlan(item);
    await prisma.$transaction(async (tx) => {
      const child = await tx.child.findUnique({ where: { id: item.childId }, select: { customFields: true } });
      invariant(child, `${item.childName} disappeared during apply.`);
      const fields = object(child.customFields);
      const updatedAt = new Date().toISOString();
      await tx.child.update({ where: { id: item.childId }, data: { customFields: {
        ...fields,
        tuitionBillingEnabled: true,
        tuitionPlanId: plan.id,
        tuitionPlanName: plan.name,
        tuitionPlanAgeGroup: plan.ageGroup,
        tuitionPlanCadence: "weekly",
        tuitionBillingCadence: "weekly",
        tuitionPlanAmountCents: plan.amountCents,
        tuitionCredits: [],
        tuitionCreditsTotalCents: 0,
        tuitionNetAmountCents: plan.amountCents,
        tuitionFundingType: item.fundingType,
        tuitionAutobillEligible: item.fundingType === "family",
        tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
        tuitionBillingStartsPeriod: item.startPeriod,
        tuitionBillingDescription: plan.name,
        tuitionBillingUpdatedAt: updatedAt,
        tuitionBillingUpdatedBy: "Brenden Bruner - Kokomo director tuition reply 2026-08-07",
        tuitionRateEvidence: { source: "director_reply", confirmedAt: updatedAt, note: item.evidence },
      } as Prisma.InputJsonObject } });
      await tx.billingAccount.upsert({ where: { familyId: item.familyId }, update: {}, create: { familyId: item.familyId, balanceCents: 0, autopayPlaceholder: false } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, centerId: CENTER_ID, userId: user.id, action: "billing.tuition_assignment.director_confirmed", resource: "Child", resourceId: item.childId, metadata: { familyId: item.familyId, childId: item.childId, amountCents: item.amountCents, fundingType: item.fundingType, startsPeriod: item.startPeriod, evidence: item.evidence, balanceChanged: false, noPaymentSubmitted: true } } });
    });
  }
  for (const item of holds) {
    await prisma.$transaction(async (tx) => {
      const child = await tx.child.findUnique({ where: { id: item.childId }, select: { customFields: true } });
      invariant(child, `${item.childName} disappeared during hold apply.`);
      const updatedAt = new Date().toISOString();
      await tx.child.update({ where: { id: item.childId }, data: { customFields: { ...object(child.customFields), tuitionBillingEnabled: false, tuitionAutobillEligible: false, tuitionBillingHoldReason: item.reason, tuitionBillingUpdatedAt: updatedAt, tuitionBillingUpdatedBy: "Brenden Bruner - Kokomo director tuition reply 2026-08-07" } as Prisma.InputJsonObject } });
      await tx.auditLog.create({ data: { tenantId: user.tenantId, centerId: CENTER_ID, userId: user.id, action: "billing.tuition_assignment.director_hold", resource: "Child", resourceId: item.childId, metadata: { familyId: item.familyId, childId: item.childId, reason: item.reason, balanceChanged: false, noPaymentSubmitted: true } } });
    });
  }
  const accounts = await prisma.billingAccount.findMany({ where: { familyId: { in: [...balanceBefore.keys()] } }, select: { familyId: true, balanceCents: true } });
  invariant(accounts.every((account) => account.balanceCents === balanceBefore.get(account.familyId)), "A Kokomo family balance changed unexpectedly.");
  console.log(JSON.stringify({ ok: true, assignments: assignments.length, holds: holds.length, invoicesCreated: 0, balancesChanged: 0, paymentsSubmitted: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
