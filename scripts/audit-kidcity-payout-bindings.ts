import "./load-env";
import { pathToFileURL } from "node:url";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import {
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { verifyStripeConnectAccountBinding } from "@/lib/stripe-connect-setup";
import {
  stripeConnectCustomFieldPatch,
  stripeConnectReadinessFromSnapshot,
  type StripeConnectRequirementStatus,
} from "@/lib/stripe-connect-readiness";
import { stripeSchoolReadinessFlowFromFields, type StripeSchoolReadinessStage } from "@/lib/stripe-school-readiness-flow";

const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];
const BATCH_SIZE = 5;

type PayoutBindingAuditRow = {
  school: string;
  locationId: string | null;
  mapped: boolean;
  reachable: boolean;
  exact: boolean;
  technicallyReady: boolean;
  payoutBankConfirmed: boolean;
  payoutBankCount: number;
  connectStatus: StripeConnectRequirementStatus;
  flowStage: StripeSchoolReadinessStage;
  schoolPaysStripeFeesDirectly: boolean;
  issue: string | null;
};

function safeProviderIssue(value: unknown) {
  const message = typeof value === "string" ? value.trim() : "";
  if (!message) return "Stripe account could not be retrieved.";
  return message.replace(/acct_[A-Za-z0-9_]+/g, "acct_[masked]").slice(0, 240);
}

export async function auditKidCityPayoutBindings(options: { includeSchools?: boolean } = {}) {
  const centers = (await prisma.center.findMany({
    where: {
      organization: {
        tenant: {
          slug: { notIn: DEMO_TENANT_SLUGS },
        },
      },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      status: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  })).filter(isActivePublicSchoolCandidate);

  const results: PayoutBindingAuditRow[] = [];
  for (let index = 0; index < centers.length; index += BATCH_SIZE) {
    const batch = centers.slice(index, index + BATCH_SIZE);
    results.push(...await Promise.all(batch.map(async (center): Promise<PayoutBindingAuditRow> => {
      const locationId = center.locationId || center.crmLocationId;
      const expectedAccountId = readStripeConnectedAccountId(center.customFields);
      if (!expectedAccountId) {
        return {
          school: center.name,
          locationId,
          mapped: false,
          reachable: false,
          exact: false,
          technicallyReady: false,
          payoutBankConfirmed: false,
          payoutBankCount: 0,
          connectStatus: "not_started",
          flowStage: "not_started",
          schoolPaysStripeFeesDirectly: false,
          issue: "No designated Stripe account is mapped.",
        };
      }

      const retrieved = await retrieveStripeConnectedAccount(expectedAccountId, {
        tenantId: center.organization.tenantId,
      });
      if (!retrieved.ok || !retrieved.account) {
        return {
          school: center.name,
          locationId,
          mapped: true,
          reachable: false,
          exact: false,
          technicallyReady: false,
          payoutBankConfirmed: false,
          payoutBankCount: 0,
          connectStatus: "not_started",
          flowStage: "not_started",
          schoolPaysStripeFeesDirectly: false,
          issue: safeProviderIssue(retrieved.error),
        };
      }

      const binding = verifyStripeConnectAccountBinding(expectedAccountId, retrieved.account.id);
      if (!binding.ok) {
        return {
          school: center.name,
          locationId,
          mapped: true,
          reachable: true,
          exact: false,
          technicallyReady: false,
          payoutBankConfirmed: false,
          payoutBankCount: 0,
          connectStatus: "not_started",
          flowStage: "not_started",
          schoolPaysStripeFeesDirectly: false,
          issue: binding.error,
        };
      }

      const payoutBanks = await listStripeConnectedAccountPayoutBanks({
        accountId: binding.accountId,
        tenantId: center.organization.tenantId,
      });
      const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
      const payoutBankConfirmed = Boolean(payoutBanks.defaultBank?.last4 && payoutBanks.defaultBank.defaultForCurrency);
      const flowFields = {
        ...(center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
          ? center.customFields as Record<string, unknown>
          : {}),
        ...stripeConnectCustomFieldPatch(readiness),
        stripePayoutBankLast4: payoutBanks.defaultBank?.last4 || null,
        stripePayoutBankDefaultConfirmed: payoutBankConfirmed,
      };
      const flow = stripeSchoolReadinessFlowFromFields({ customFields: flowFields, centerName: center.name });
      const schoolPaysStripeFeesDirectly = retrieved.account.feesCollector === "stripe";
      return {
        school: center.name,
        locationId,
        mapped: true,
        reachable: true,
        exact: true,
        technicallyReady: readiness.status === "ready",
        payoutBankConfirmed,
        payoutBankCount: payoutBanks.banks.length,
        connectStatus: readiness.status,
        flowStage: flow.stage,
        schoolPaysStripeFeesDirectly,
        issue: payoutBanks.ok ? null : safeProviderIssue(payoutBanks.error),
      };
    })));
  }

  const failures = results.filter((row) => !row.mapped || !row.reachable || !row.exact || row.issue);
  const summary = {
    ok: failures.length === 0,
    activeSchools: results.length,
    mappedAccounts: results.filter((row) => row.mapped).length,
    reachableExactAccounts: results.filter((row) => row.reachable && row.exact).length,
    technicallyReadyAccounts: results.filter((row) => row.technicallyReady).length,
    unresolvedOnboardingAccounts: results.filter(
      (row) => row.reachable && row.exact && !row.technicallyReady,
    ).length,
    confirmedPayoutBanks: results.filter((row) => row.payoutBankConfirmed).length,
    awaitingPayoutBank: results.filter((row) => row.reachable && row.exact && !row.payoutBankConfirmed).length,
    onboardingStages: {
      schoolActionRequired: results.filter((row) => row.connectStatus === "requirements_due").length,
      stripeReviewPending: results.filter((row) => row.connectStatus === "verification_pending").length,
      chargesPending: results.filter((row) => row.connectStatus === "charges_pending").length,
      payoutsPending: results.filter((row) => row.connectStatus === "payouts_pending").length,
      payoutBankRequired: results.filter((row) => row.flowStage === "payout_bank_required").length,
      finalActivationRequired: results.filter((row) => row.flowStage === "activation_required").length,
      paymentsLive: results.filter((row) => row.flowStage === "ready").length,
    },
    feeResponsibility: {
      schoolPaysStripeDirectly: results.filter((row) => row.reachable && row.exact && row.schoolPaysStripeFeesDirectly).length,
      retainedFromSchoolProceeds: results.filter((row) => row.reachable && row.exact && !row.schoolPaysStripeFeesDirectly).length,
      unverifiable: results.filter((row) => row.mapped && (!row.reachable || !row.exact)).length,
      parentPaysProcessingFees: 0,
    },
    failures: failures.map(({ school, locationId, issue }) => ({ school, locationId, issue })),
    schools: options.includeSchools
      ? results.map(({ school, locationId, technicallyReady, payoutBankConfirmed, connectStatus, flowStage }) => ({
          school,
          locationId,
          technicallyReady,
          payoutBankConfirmed,
          connectStatus,
          flowStage,
        }))
      : undefined,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
  return summary;
}

async function main() {
  try {
    await auditKidCityPayoutBindings({
      includeSchools: process.argv.includes("--include-schools"),
    });
  } finally {
    await prisma.$disconnect();
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
