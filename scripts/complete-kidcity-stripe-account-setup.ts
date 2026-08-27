import "./load-env";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import {
  completeStripeConnectedAccountBusinessProfile,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountDailyPayouts,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { buildSchoolPayoutSetupInput } from "@/lib/school-payout-onboarding";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { normalizeStripeConnectSetupInput } from "@/lib/stripe-connect-setup";
import { readSchoolEin } from "@/lib/school-tax-id";

const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function argValues(name: string) {
  const prefix = `${name}=`;
  return process.argv
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length).trim())
    .filter(Boolean);
}

function jsonInput(value: Prisma.JsonObject): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function maskAccountId(accountId: string) {
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
}

export async function completeKidCityStripeAccountSetup() {
  const apply = hasFlag("--apply");
  const acknowledgeStripeState = hasFlag("--acknowledge-stripe-state");
  const selectedLocationIds = argValues("--location-id");
  if (apply && !acknowledgeStripeState) {
    throw new Error("--apply requires --acknowledge-stripe-state because this updates live connected-account profiles and payout schedules.");
  }

  const centers = (await prisma.center.findMany({
    where: {
      organization: { tenant: { slug: { notIn: DEMO_TENANT_SLUGS } } },
      ...(selectedLocationIds.length
        ? {
            OR: selectedLocationIds.flatMap((locationId) => [
              { locationId },
              { crmLocationId: locationId },
            ]),
          }
        : {}),
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      status: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  })).filter(isActivePublicSchoolCandidate);

  const results: Array<Record<string, unknown>> = [];
  async function processCenter(center: typeof centers[number]): Promise<Record<string, unknown>> {
    const accountId = readStripeConnectedAccountId(center.customFields);
    if (!accountId) {
      return { center: center.name, locationId: center.locationId || center.crmLocationId, status: "missing_account" };
    }

    const setup = normalizeStripeConnectSetupInput(buildSchoolPayoutSetupInput({}, center), center);
    if (!setup.ok) {
      return {
        center: center.name,
        locationId: center.locationId || center.crmLocationId,
        accountId: maskAccountId(accountId),
        status: "invalid_school_profile",
        errors: setup.errors,
      };
    }

    let profileUpdated = false;
    let payoutScheduleUpdated = false;
    let error: string | null = null;
    const schoolEin = readSchoolEin(center.customFields);
    const existing = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
      ? center.customFields as Prisma.JsonObject
      : {};
    const initial = await retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId });
    if (!initial.ok || !initial.account) {
      return {
        center: center.name,
        locationId: center.locationId || center.crmLocationId,
        accountId: maskAccountId(accountId),
        status: "stripe_read_failed",
        profileUpdated,
        payoutScheduleUpdated,
        error: initial.error || "Stripe account status could not be read.",
      };
    }

    if (apply) {
      const alreadyReady = initial.account.chargesEnabled && initial.account.payoutsEnabled;
      const onboardingAlreadyPrepared = Boolean(existing.stripeConnectLastOnboardingAt);
      if (!alreadyReady && !onboardingAlreadyPrepared) {
        const profile = await completeStripeConnectedAccountBusinessProfile({
          accountId,
          businessPhone: setup.details.payoutContactPhone,
          businessUrl: setup.details.businessUrl,
          ein: schoolEin,
          tenantId: center.organization.tenantId,
          idempotencyKey: `kidcity-account-profile-v4-${center.id}`,
        });
        profileUpdated = profile.ok;
        if (!profile.ok) error = profile.error || "Stripe business profile update failed.";
      }

      if (!error) {
        const schedule = await setStripeConnectedAccountDailyPayouts({
          accountId,
          tenantId: center.organization.tenantId,
        });
        payoutScheduleUpdated = schedule.ok;
        if (!schedule.ok) error = schedule.error || "Stripe payout schedule update failed.";
      }
    }

    const retrieved = apply
      ? await retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId })
      : initial;
    if (!retrieved.ok || !retrieved.account) {
      return {
        center: center.name,
        locationId: center.locationId || center.crmLocationId,
        accountId: maskAccountId(accountId),
        status: "stripe_read_failed",
        profileUpdated,
        payoutScheduleUpdated,
        error: retrieved.error || error,
      };
    }

    const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
    if (apply) {
      await prisma.center.update({
        where: { id: center.id },
        data: {
          customFields: jsonInput({
            ...existing,
            ...stripeConnectCustomFieldPatch(readiness),
            ...(profileUpdated
              ? { stripeConnectBusinessProfileCompletedAt: new Date().toISOString() }
              : {}),
            ...(profileUpdated && schoolEin ? { stripeConnectEinSubmittedAt: new Date().toISOString() } : {}),
            stripeConnectPayoutSchedule: payoutScheduleUpdated ? "daily" : existing.stripeConnectPayoutSchedule,
          }),
        },
      });
    }

    return {
      center: center.name,
      locationId: center.locationId || center.crmLocationId,
      accountId: maskAccountId(accountId),
      status: readiness.status,
      profileUpdated,
      payoutScheduleUpdated,
      einProvidedToStripe: Boolean(schoolEin),
      chargesEnabled: readiness.chargesEnabled,
      payoutsEnabled: readiness.payoutsEnabled,
      remainingRequirements: readiness.requirementFields,
      error,
    };
  }

  const concurrency = 5;
  for (let index = 0; index < centers.length; index += concurrency) {
    const batch = await Promise.all(centers.slice(index, index + concurrency).map(processCenter));
    results.push(...batch);
  }

  const summary = {
    ok: results.every((result) => !["missing_account", "invalid_school_profile", "stripe_read_failed"].includes(String(result.status)) && !result.error),
    apply,
    activeSchools: centers.length,
    profilesUpdated: results.filter((result) => result.profileUpdated).length,
    dailyPayoutSchedules: results.filter((result) => result.payoutScheduleUpdated).length,
    ready: results.filter((result) => result.status === "ready").length,
    requirementsDue: results.filter((result) => result.status === "requirements_due").length,
    errors: results.filter((result) => result.error).length,
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

async function run() {
  try {
    await completeKidCityStripeAccountSetup();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) void run();
