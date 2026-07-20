import "./load-env";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { isActivePublicSchoolCandidate } from "@/lib/active-school-locations";
import {
  createStripeAccountLink,
  createStripeConnectedAccount,
  getStripeSecretKey,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import {
  buildSchoolPayoutSetupInput,
  schoolPayoutSetupCustomFieldPatch,
} from "@/lib/school-payout-onboarding";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import {
  normalizeStripeConnectSetupInput,
  STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE,
} from "@/lib/stripe-connect-setup";

const DEMO_TENANT_SLUGS = ["bee-suite-demo", "bee-suite-isolated-demo"];
const BULK_SETUP_VERSION = "2026-06-kidcity-bulk-payout-profile-v1";

type BulkResult = {
  centerId: string;
  centerName: string;
  locationId: string | null;
  status: "profile_ready" | "validation_failed" | "account_created" | "onboarding_link_created" | "stripe_failed" | "dry_run";
  stripeConnectedAccountId: string | null;
  onboardingUrl?: string | null;
  errors?: Record<string, string>;
  error?: string;
};

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
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

function parseLimit() {
  const value = Number.parseInt(argValue("--limit"), 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function maskAccountId(accountId: string | null) {
  if (!accountId) return null;
  if (accountId.length <= 12) return `${accountId.slice(0, 4)}...`;
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
}

function appBaseUrl() {
  return (argValue("--app-url") || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://thebeesuite.io").replace(/\/$/, "");
}

async function assertConnectedAccountReadPreflight(
  centers: Array<{
    name: string;
    customFields: unknown;
    organization: { tenantId: string };
  }>,
) {
  const connectedCenters = centers
    .map((center) => ({ center, accountId: readStripeConnectedAccountId(center.customFields) }))
    .filter((row): row is { center: typeof centers[number]; accountId: string } => Boolean(row.accountId));

  for (const { center, accountId } of connectedCenters) {
    const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: center.organization.tenantId });
    if (!retrieved.ok) {
      throw new Error(
        `Stripe connected-account read preflight failed for ${center.name} (${maskAccountId(accountId)}). ` +
          `${retrieved.error || "Stripe account status could not be verified."} ${STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE}`,
      );
    }
  }
}

export async function prepareKidCitySchoolPayouts() {
  const apply = hasFlag("--apply");
  const createAccounts = hasFlag("--create-accounts");
  const createLinks = hasFlag("--create-links");
  const acknowledgeStripeState = hasFlag("--acknowledge-stripe-state");
  const skipPreflight = hasFlag("--skip-stripe-read-preflight");
  const onlyMissingAccount = hasFlag("--only-missing-account");
  const limit = parseLimit();
  const selectedLocationIds = argValues("--location-id");
  const selectedStates = new Set(argValues("--state").map((state) => state.toUpperCase()));

  if ((createAccounts || createLinks) && !apply) {
    throw new Error("--create-accounts/--create-links requires --apply because it creates Stripe state and stores connected account IDs.");
  }
  if ((createAccounts || createLinks) && !acknowledgeStripeState) {
    throw new Error("--create-accounts/--create-links requires --acknowledge-stripe-state.");
  }

  const centers = await prisma.center.findMany({
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
      ...(selectedStates.size ? { state: { in: Array.from(selectedStates) } } : {}),
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
  });

  let activeCenters = centers.filter(isActivePublicSchoolCandidate);
  if (onlyMissingAccount) {
    activeCenters = activeCenters.filter((center) => !readStripeConnectedAccountId(center.customFields));
  }
  if (limit) activeCenters = activeCenters.slice(0, limit);

  if ((createAccounts || createLinks) && !skipPreflight) {
    await assertConnectedAccountReadPreflight(activeCenters);
  }

  const baseUrl = appBaseUrl();
  const results: BulkResult[] = [];

  for (const center of activeCenters) {
    const setupInput = buildSchoolPayoutSetupInput({}, center);
    const setup = normalizeStripeConnectSetupInput(setupInput, center);
    const locationId = center.locationId || center.crmLocationId || null;

    if (!setup.ok) {
      results.push({
        centerId: center.id,
        centerName: center.name,
        locationId,
        status: "validation_failed",
        stripeConnectedAccountId: maskAccountId(readStripeConnectedAccountId(center.customFields)),
        errors: setup.errors as Record<string, string>,
      });
      continue;
    }

    let accountId = readStripeConnectedAccountId(center.customFields);
    let customFields = schoolPayoutSetupCustomFieldPatch({
      existingCustomFields: center.customFields,
      setupDetails: setup.details,
      setupVersion: BULK_SETUP_VERSION,
    });
    let onboardingUrl: string | null = null;
    let status: BulkResult["status"] = apply ? "profile_ready" : "dry_run";

    if (createAccounts || createLinks) {
      const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId: center.organization.tenantId }));
      if (!stripeConfigured) {
        results.push({
          centerId: center.id,
          centerName: center.name,
          locationId,
          status: "stripe_failed",
          stripeConnectedAccountId: maskAccountId(accountId),
          error: "Stripe is not configured for this tenant.",
        });
        continue;
      }

      if (!accountId) {
        const created = await createStripeConnectedAccount({
          businessName: setup.details.legalBusinessName,
          displayName: setup.details.displayName,
          email: setup.details.payoutContactEmail,
          phone: setup.details.payoutContactPhone,
          supportEmail: setup.details.supportEmail,
          supportPhone: setup.details.supportPhone,
          address: setup.details.addressLine1,
          addressLine2: setup.details.addressLine2,
          city: setup.details.city,
          state: setup.details.state,
          postalCode: setup.details.postalCode,
          businessUrl: setup.details.businessUrl,
          productDescription: setup.details.productDescription,
          idempotencyKey: `kidcity-connect-account-${center.id}`,
          tenantId: center.organization.tenantId,
        });
        if (!created.ok || !created.id) {
          results.push({
            centerId: center.id,
            centerName: center.name,
            locationId,
            status: "stripe_failed",
            stripeConnectedAccountId: null,
            error: created.error || "Stripe connected account could not be created.",
          });
          continue;
        }
        accountId = created.id;
        const readiness = created.account ? stripeConnectReadinessFromSnapshot(created.account) : null;
        customFields = {
          ...customFields,
          stripeConnectAccountId: accountId,
          ...(readiness ? stripeConnectCustomFieldPatch(readiness) : {}),
          stripePayoutStatus: "onboarding_started",
          stripeConnectDashboard: "express",
          stripeConnectApi: "accounts_v2",
          stripeConnectCreatedAt: new Date().toISOString(),
        };
        status = "account_created";
      }

      if (createLinks) {
        const link = await createStripeAccountLink({
          accountId,
          refreshUrl: `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`,
          returnUrl: `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`,
          tenantId: center.organization.tenantId,
        });
        if (!link.ok || !link.url) {
          results.push({
            centerId: center.id,
            centerName: center.name,
            locationId,
            status: "stripe_failed",
            stripeConnectedAccountId: maskAccountId(accountId),
            error: link.error || "Stripe onboarding link could not be created.",
          });
          if (accountId && apply) {
            await prisma.center.update({
              where: { id: center.id },
              data: { customFields: jsonInput(customFields) },
            });
          }
          continue;
        }
        onboardingUrl = link.url;
        status = "onboarding_link_created";
        customFields = {
          ...customFields,
          stripeConnectAccountId: accountId,
          stripeConnectDashboard: "express",
          stripeConnectApi: "accounts_v2",
          stripeConnectLastOnboardingAt: new Date().toISOString(),
          stripePayoutStatus: "onboarding_started",
        };
      }
    }

    if (apply) {
      await prisma.center.update({
        where: { id: center.id },
        data: { customFields: jsonInput(customFields) },
      });
    }

    results.push({
      centerId: center.id,
      centerName: center.name,
      locationId,
      status,
      stripeConnectedAccountId: maskAccountId(accountId),
      onboardingUrl,
    });
  }

  const summary = {
    ok: results.every((result) => result.status !== "validation_failed" && result.status !== "stripe_failed"),
    apply,
    createAccounts,
    createLinks,
    activeSchools: activeCenters.length,
    profileReady: results.filter((result) => result.status === "profile_ready" || result.status === "dry_run").length,
    validationFailed: results.filter((result) => result.status === "validation_failed").length,
    accountCreated: results.filter((result) => result.status === "account_created").length,
    onboardingLinkCreated: results.filter((result) => result.status === "onboarding_link_created").length,
    stripeFailed: results.filter((result) => result.status === "stripe_failed").length,
  };

  console.log(JSON.stringify({ summary, results }, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

export async function runPrepareKidCitySchoolPayouts() {
  try {
    await prepareKidCitySchoolPayouts();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void runPrepareKidCitySchoolPayouts();
}
