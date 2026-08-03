import "./load-env";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import {
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeBillingApprovalCustomFieldPatch } from "@/lib/stripe-billing-approval";
import {
  stripeConnectCustomFieldPatch,
  stripeConnectReadinessFromSnapshot,
} from "@/lib/stripe-connect-readiness";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-stripe-ready-billing-activation";
const FINGERPRINT_PREFIX = "--confirm-fingerprint=";
const ACTIVATION_SOURCE = "stripe_ready_school_billing_activation_2026_08_03";
const ACTIVATION_ACTION = "billing.stripe_ready_school.activated";
const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function jsonInput(value: Prisma.JsonObject): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function maskAccountId(accountId: string) {
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
}

function activationFingerprint(rows: Array<{ centerId: string; accountId: string }>) {
  const canonical = rows
    .map((row) => `${row.centerId}:${row.accountId}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

type CenterRow = Awaited<ReturnType<typeof readCenters>>[number];

async function readCenters() {
  const centers = await prisma.center.findMany({
    where: {
      organization: { tenant: { slug: { notIn: DEMO_TENANT_SLUGS } } },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      status: true,
      customFields: true,
      organization: { select: { tenantId: true } },
      _count: {
        select: {
          tuitionPlans: true,
        },
      },
    },
  });
  return centers.filter((center) => isActivePublicSchoolCandidate(center));
}

async function inspectCenter(center: CenterRow) {
  const accountId = readStripeConnectedAccountId(center.customFields);
  if (!accountId) {
    return {
      eligible: false as const,
      center,
      accountId: null,
      readiness: null,
      payoutBankConfirmed: false,
      reason: "missing_connected_account",
    };
  }

  const retrieved = await retrieveStripeConnectedAccount(accountId, {
    tenantId: center.organization.tenantId,
  });
  if (!retrieved.ok || !retrieved.account) {
    return {
      eligible: false as const,
      center,
      accountId,
      readiness: null,
      payoutBankConfirmed: false,
      reason: retrieved.error || "stripe_account_unreachable",
    };
  }

  const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
  const payoutBanks = await listStripeConnectedAccountPayoutBanks({
    accountId,
    tenantId: center.organization.tenantId,
  });
  const payoutBankConfirmed = payoutBanks.ok && Boolean(payoutBanks.defaultBank?.last4);
  const eligible = readiness.status === "ready" && payoutBankConfirmed;

  return {
    eligible,
    center,
    accountId,
    readiness,
    payoutBankConfirmed,
    reason: eligible
      ? null
      : !payoutBanks.ok
        ? payoutBanks.error || "payout_bank_lookup_failed"
        : readiness.status !== "ready"
          ? readiness.status
          : "default_payout_bank_missing",
  };
}

async function activationInventory(centerId: string) {
  const [families, billingAccounts, enabledTuitionAssignments] = await Promise.all([
    prisma.family.count({ where: { centerId } }),
    prisma.billingAccount.count({ where: { family: { centerId } } }),
    prisma.child.count({
      where: {
        family: { centerId },
        customFields: { path: ["tuitionBillingEnabled"], equals: true },
      },
    }),
  ]);
  return { families, billingAccounts, enabledTuitionAssignments };
}

async function main() {
  const apply = process.argv.includes(APPLY_FLAG);
  const confirmed = process.argv.includes(CONFIRM_FLAG);
  const suppliedFingerprint = process.argv
    .find((arg) => arg.startsWith(FINGERPRINT_PREFIX))
    ?.slice(FINGERPRINT_PREFIX.length)
    .trim();

  invariant(!apply || confirmed, `Apply mode requires ${CONFIRM_FLAG}.`);
  invariant(!apply || suppliedFingerprint, `Apply mode requires ${FINGERPRINT_PREFIX}<dry-run fingerprint>.`);

  const centers = await readCenters();
  const inspected = [];
  const concurrency = 5;
  for (let index = 0; index < centers.length; index += concurrency) {
    inspected.push(...await Promise.all(centers.slice(index, index + concurrency).map(inspectCenter)));
  }

  const eligible = inspected.filter((row) => row.eligible && row.accountId && row.readiness);
  invariant(eligible.length > 0, "No Stripe-ready schools with a confirmed payout bank were found.");
  const fingerprint = activationFingerprint(eligible.map((row) => ({
    centerId: row.center.id,
    accountId: row.accountId!,
  })));
  invariant(!apply || suppliedFingerprint === fingerprint, "Stripe-ready school set changed after dry-run review; rerun the dry run before applying.");

  const plan = [];
  for (const row of eligible) {
    const current = jsonObject(row.center.customFields);
    plan.push({
      centerId: row.center.id,
      school: row.center.name,
      locationId: row.center.locationId || row.center.crmLocationId,
      accountId: maskAccountId(row.accountId!),
      tuitionPlans: row.center._count.tuitionPlans,
      ...await activationInventory(row.center.id),
      alreadyActivated:
        current.livePaymentsEnabled === true &&
        current.tuitionBillingEnabled === true &&
        current.refundsEnabled === true &&
        current.stripeBillingApproved === true,
    });
  }

  if (!apply) {
    console.log(JSON.stringify({
      ok: true,
      apply: false,
      activeSchoolsInspected: centers.length,
      eligibleSchools: eligible.length,
      blockedSchools: inspected.length - eligible.length,
      activationFingerprint: fingerprint,
      plan,
      boundaries: {
        createsCharges: false,
        createsInvoices: false,
        createsRefunds: false,
        changesPayments: false,
        changesChildTuitionAssignments: false,
        changesPayoutAccounts: false,
      },
    }, null, 2));
    return;
  }

  const activatedAt = new Date().toISOString();
  const billingApprovalPatch = stripeBillingApprovalCustomFieldPatch({
    approved: true,
    approvedAt: activatedAt,
    approvedBy: "Brenden Bruner - explicit user authorization on 2026-08-03",
    billingPreviewApprovedAt: activatedAt,
    accountingApprovedAt: activatedAt,
    cutoverApprovedAt: activatedAt,
  });
  let activated = 0;
  let alreadyActivated = 0;
  for (const planned of plan) {
    const row = eligible.find((item) => item.center.id === planned.centerId);
    invariant(row?.accountId && row.readiness, `Eligible school disappeared: ${planned.school}`);

    // Recheck Stripe immediately before each mutation so capability drift fails closed.
    const currentInspection = await inspectCenter(row.center);
    invariant(currentInspection.eligible && currentInspection.accountId && currentInspection.readiness, `${planned.school} is no longer Stripe-ready with a confirmed payout bank.`);
    invariant(currentInspection.accountId === row.accountId, `${planned.school} connected-account binding changed after review.`);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.center.findUnique({
        where: { id: planned.centerId },
        select: { customFields: true, organization: { select: { tenantId: true } } },
      });
      invariant(current, `${planned.school} no longer exists.`);
      invariant(current.organization.tenantId === row.center.organization.tenantId, `${planned.school} tenant changed after review.`);
      const fields = jsonObject(current.customFields);
      const wasActivated = fields.livePaymentsEnabled === true &&
        fields.tuitionBillingEnabled === true &&
        fields.refundsEnabled === true &&
        fields.stripeBillingApproved === true;

      await tx.center.update({
        where: { id: planned.centerId },
        data: {
          customFields: jsonInput({
            ...fields,
            ...stripeConnectCustomFieldPatch(currentInspection.readiness),
            ...billingApprovalPatch,
            livePaymentsEnabled: true,
            tuitionBillingEnabled: true,
            refundsEnabled: true,
            billingActivationStatus: "active",
            billingActivationSource: ACTIVATION_SOURCE,
            billingActivatedAt: typeof fields.billingActivatedAt === "string" ? fields.billingActivatedAt : activatedAt,
            billingActivationLastVerifiedAt: activatedAt,
          }),
        },
      });

      if (!wasActivated) {
        await tx.auditLog.create({
          data: {
            tenantId: row.center.organization.tenantId,
            centerId: planned.centerId,
            action: ACTIVATION_ACTION,
            resource: "Center",
            resourceId: planned.centerId,
            metadata: {
              source: ACTIVATION_SOURCE,
              authorization: "user_authorized_all_stripe_ready_schools_for_full_billing_capability",
              activationFingerprint: fingerprint,
              stripeReadiness: "ready",
              payoutBankConfirmed: true,
              livePaymentsEnabled: true,
              tuitionBillingEnabled: true,
              refundsEnabled: true,
              stripeBillingApproved: true,
              stripeBillingApprovalVersion: billingApprovalPatch.stripeBillingApprovalVersion,
              childTuitionAssignmentsChanged: false,
              invoicesCreated: false,
              chargesCreated: false,
              refundsCreated: false,
              paymentsChanged: false,
              payoutAccountChanged: false,
              activatedAt,
            },
          },
        });
      }
      return { wasActivated };
    }, { maxWait: 10_000, timeout: 30_000 });

    if (result.wasActivated) alreadyActivated += 1;
    else activated += 1;
  }

  const verified = await prisma.center.findMany({
    where: { id: { in: plan.map((row) => row.centerId) } },
    select: { id: true, name: true, customFields: true },
  });
  invariant(verified.length === plan.length, "A Stripe-ready school is missing after activation.");
  invariant(verified.every((center) => {
    const fields = jsonObject(center.customFields);
    return fields.livePaymentsEnabled === true &&
      fields.tuitionBillingEnabled === true &&
      fields.refundsEnabled === true &&
      fields.billingActivationStatus === "active" &&
      fields.stripeBillingApproved === true &&
      typeof fields.stripeBillingApprovalVersion === "string";
  }), "At least one Stripe-ready school failed billing activation verification.");

  console.log(JSON.stringify({
    ok: true,
    apply: true,
    activationFingerprint: fingerprint,
    eligibleSchools: plan.length,
    activated,
    alreadyActivated,
    verified: verified.map((center) => center.name).sort(),
    boundaries: {
      chargesCreated: 0,
      invoicesCreated: 0,
      refundsCreated: 0,
      paymentsChanged: 0,
      childTuitionAssignmentsChanged: 0,
      payoutAccountsChanged: 0,
    },
  }, null, 2));
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
