import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { isCurrentlyEnrolledStatus } from "@/lib/enrollment-status";
import {
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import {
  nextWeeklyBillingPeriod,
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";

const APPLY = "--apply";
const CONFIRM = "--confirm-reviewed-weekly-tuition-rates";
const FP = "--confirm-fingerprint=";
const INPUT = "--input=";
const STARTS = "--starts-period=";

type Reconciliation = { details?: Array<{ school?: string; childId?: string; ageGroup?: string; status?: string; recommendedWeeklyCents?: number; sourceAsOf?: string; sourceFile?: string }> };
type Rate = { school: string; childId: string; ageGroup: string; amountCents: number; sourceAsOf: string; sourceFile: string };

function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function object(value: Prisma.JsonValue | null | undefined) { return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {}; }
function inputObject(value: Prisma.JsonObject) { return value as Prisma.InputJsonObject; }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function arg(prefix: string) { return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim(); }
function fingerprint(rates: Rate[], startsPeriod: string) { return createHash("sha256").update(JSON.stringify({ startsPeriod, rates: rates.slice().sort((a,b)=>a.childId.localeCompare(b.childId)) })).digest("hex"); }

function loadRates(path: string) {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Reconciliation;
  const rows = (parsed.details || []).filter((row) => row.status === "Exact weekly contract").map((row) => ({
    school: String(row.school || "").trim(), childId: String(row.childId || "").trim(), ageGroup: String(row.ageGroup || "").trim(),
    amountCents: Number(row.recommendedWeeklyCents), sourceAsOf: String(row.sourceAsOf || "").trim(), sourceFile: String(row.sourceFile || "").trim(),
  }));
  invariant(rows.length > 0, "No exact weekly contract rows found.");
  invariant(rows.every((row) => row.school && row.childId && row.ageGroup && Number.isInteger(row.amountCents) && row.amountCents > 0 && row.sourceFile), "A reviewed rate row is incomplete.");
  invariant(new Set(rows.map((row) => row.childId)).size === rows.length, "Duplicate child IDs exist in the reviewed rates.");
  return rows;
}

async function verifySchoolStripe(center: { name: string; customFields: Prisma.JsonValue | null; organization: { tenantId: string } }) {
  const accountId = readStripeConnectedAccountId(center.customFields);
  invariant(accountId, `${center.name} has no connected Stripe account.`);
  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId });
  invariant(retrieved.ok && retrieved.account, `${center.name} Stripe account is unreachable.`);
  invariant(verifyStripeConnectAccountBinding(accountId, retrieved.account.id).ok, `${center.name} Stripe account binding mismatch.`);
  invariant(stripeConnectReadinessFromSnapshot(retrieved.account).status === "ready", `${center.name} Stripe account is not ready.`);
  const banks = await listStripeConnectedAccountPayoutBanks({ accountId, tenantId: center.organization.tenantId });
  invariant(banks.ok && banks.defaultBank?.last4, `${center.name} has no confirmed default payout bank.`);
  return accountId;
}

async function main() {
  const inputPath = arg(INPUT); invariant(inputPath, `${INPUT}<path> is required.`);
  const apply = process.argv.includes(APPLY); const confirmed = process.argv.includes(CONFIRM); const expected = arg(FP);
  invariant(!apply || confirmed, `Apply mode requires ${CONFIRM}.`); invariant(!apply || expected, `Apply mode requires ${FP}<value>.`);
  const rates = loadRates(inputPath); const startsPeriod = arg(STARTS) || nextWeeklyBillingPeriod(new Date());
  invariant(/^\d{4}-W\d{2}$/.test(startsPeriod), `${STARTS} must be an ISO weekly period.`);
  invariant(!apply || arg(STARTS), `Apply mode requires ${STARTS}<period> so retries remain stable.`);
  const currentFingerprint = fingerprint(rates, startsPeriod);
  invariant(!apply || expected === currentFingerprint, "Reviewed rate set or effective period changed; rerun the dry run.");
  const children = await prisma.child.findMany({ where: { id: { in: rates.map((row) => row.childId) } }, select: { id: true, fullName: true, ageGroup: true, enrollmentStatus: true, customFields: true, family: { select: { id: true, centerId: true } } } });
  invariant(children.length === rates.length, "One or more reviewed children no longer exist.");
  const childById = new Map(children.map((child) => [child.id, child]));
  const schoolNames = [...new Set(rates.map((row) => row.school))];
  const centers = await prisma.center.findMany({ where: { name: { in: schoolNames } }, select: { id: true, name: true, customFields: true, organization: { select: { tenantId: true } } } });
  invariant(centers.length === schoolNames.length, "One or more reviewed schools no longer exist uniquely.");
  const centerByName = new Map(centers.map((center) => [center.name, center]));
  for (const rate of rates) {
    const child = childById.get(rate.childId)!; const center = centerByName.get(rate.school)!;
    invariant(child.family.centerId === center.id, `${child.fullName} moved to another school.`);
    invariant(isCurrentlyEnrolledStatus(child.enrollmentStatus), `${child.fullName} is no longer actively enrolled.`);
    invariant(child.ageGroup === rate.ageGroup, `${child.fullName} age group changed after review.`);
    const fields = object(child.customFields);
    const evidence = object(fields.tuitionRateEvidence as Prisma.JsonValue | undefined);
    const matchingAssignment = fields.tuitionBillingEnabled === true && fields.tuitionPlanAmountCents === rate.amountCents && fields.tuitionBillingStartsPeriod === startsPeriod && string(evidence.manifestFingerprint) === currentFingerprint;
    invariant(fields.tuitionBillingEnabled !== true || matchingAssignment, `${child.fullName} already has a different enabled assignment; stop and reconcile it.`);
    const centerFields = object(center.customFields);
    invariant(stripeSchoolBillingApproval({ customFields: centerFields, centerName: center.name }).approved && centerFields.livePaymentsEnabled === true && centerFields.tuitionBillingEnabled === true, `${center.name} billing approval is not active.`);
  }
  const plan = schoolNames.map((school) => ({ school, children: rates.filter((row) => row.school === school).length, uniqueRates: new Set(rates.filter((row) => row.school === school).map((row) => row.amountCents)).size }));
  if (!apply) { console.log(JSON.stringify({ ok: true, apply: false, startsPeriod, fingerprint: currentFingerprint, exactChildren: rates.length, schools: plan, boundaries: { createsInvoices: false, createsCharges: false, changesPayments: false, changesRefunds: false } }, null, 2)); return; }
  let assigned = 0, alreadyAssigned = 0, plansCreated = 0;
  for (const school of schoolNames) {
    const center = centerByName.get(school)!; const accountId = await verifySchoolStripe(center); const schoolRates = rates.filter((row) => row.school === school);
    for (const rate of schoolRates) {
      const result = await prisma.$transaction(async (tx) => {
        const freshCenter = await tx.center.findUnique({ where: { id: center.id }, select: { customFields: true } }); invariant(freshCenter, `${school} disappeared.`);
        invariant(readStripeConnectedAccountId(freshCenter.customFields) === accountId, `${school} Stripe binding changed during cutover.`);
        const fresh = await tx.child.findUnique({ where: { id: rate.childId }, select: { fullName: true, ageGroup: true, enrollmentStatus: true, customFields: true, family: { select: { centerId: true } } } }); invariant(fresh, `Child ${rate.childId} disappeared.`);
        invariant(fresh.family.centerId === center.id && fresh.ageGroup === rate.ageGroup && isCurrentlyEnrolledStatus(fresh.enrollmentStatus), `${fresh.fullName} eligibility changed during cutover.`);
        const fields = object(fresh.customFields); const evidence = object(fields.tuitionRateEvidence as Prisma.JsonValue | undefined);
        const matchingAssignment = fields.tuitionBillingEnabled === true && fields.tuitionPlanAmountCents === rate.amountCents && fields.tuitionBillingStartsPeriod === startsPeriod && string(evidence.manifestFingerprint) === currentFingerprint;
        invariant(fields.tuitionBillingEnabled !== true || matchingAssignment, `${fresh.fullName} gained a different assignment during cutover.`);
        if (matchingAssignment) return { assigned: false, planCreated: false };
        let tuitionPlan = await tx.tuitionPlan.findFirst({ where: { centerId: center.id, ageGroup: rate.ageGroup, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: rate.amountCents }, orderBy: { id: "asc" } });
        let planCreated = false;
        if (!tuitionPlan) { tuitionPlan = await tx.tuitionPlan.create({ data: { centerId: center.id, ageGroup: rate.ageGroup, cadence: WEEKLY_TUITION_AUTOBILL_CADENCE, amountCents: rate.amountCents, name: `ProCare ${rate.ageGroup} Weekly $${(rate.amountCents / 100).toFixed(2)}` } }); planCreated = true; }
        const updatedAt = new Date().toISOString();
        await tx.child.update({ where: { id: rate.childId }, data: { customFields: inputObject({ ...fields, tuitionBillingEnabled: true, tuitionPlanId: tuitionPlan.id, tuitionPlanName: tuitionPlan.name, tuitionPlanAgeGroup: tuitionPlan.ageGroup, tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE, tuitionBillingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE, tuitionPlanAmountCents: rate.amountCents, tuitionFundingType: "family", tuitionAutobillEligible: true, tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY, tuitionBillingStartsPeriod: startsPeriod, tuitionBillingDescription: tuitionPlan.name, tuitionBillingUpdatedAt: updatedAt, tuitionBillingUpdatedBy: "Brenden Bruner - reviewed ProCare weekly tuition cutover 2026-08-03", tuitionRateEvidence: { source: "procare_contract_billing", sourceAsOf: rate.sourceAsOf, sourceFile: rate.sourceFile, manifestFingerprint: currentFingerprint } }) } });
        await tx.auditLog.create({ data: { tenantId: center.organization.tenantId, centerId: center.id, action: "billing.tuition_assignment.procare_activated", resource: "Child", resourceId: rate.childId, metadata: { amountCents: rate.amountCents, planId: tuitionPlan.id, startsPeriod, sourceAsOf: rate.sourceAsOf, manifestFingerprint: currentFingerprint } } });
        return { assigned: true, planCreated };
      }, { maxWait: 10_000, timeout: 15_000 });
      if (result.assigned) assigned++; else alreadyAssigned++;
      if (result.planCreated) plansCreated++;
    }
  }
  console.log(JSON.stringify({ ok: true, apply: true, startsPeriod, fingerprint: currentFingerprint, assigned, alreadyAssigned, plansCreated, boundaries: { invoicesCreated: 0, chargesCreated: 0, paymentsChanged: 0, refundsChanged: 0 } }, null, 2));
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; }).finally(() => prisma.$disconnect());
