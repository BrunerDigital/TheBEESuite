import "./load-env";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import {
  createStripeAccountLink,
  createStripeConnectedAccount,
  getStripeSecretKey,
  readStripeConnectedAccountId,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import {
  buildSchoolPayoutSetupInput,
  hasSchoolPayoutSelector,
  SCHOOL_PAYOUT_SETUP_VERSION,
  schoolPayoutSetupCustomFieldPatch,
  schoolPayoutCenterWhere,
  type SchoolPayoutSelector,
  type SchoolPayoutSetupArgs,
} from "@/lib/school-payout-onboarding";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { normalizeStripeConnectSetupInput } from "@/lib/stripe-connect-setup";

type PrepareOptions = {
  defaultSelector?: SchoolPayoutSelector;
  defaultInput?: SchoolPayoutSetupArgs;
  scriptVersion?: string;
};

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function firstArgValue(...names: string[]) {
  for (const name of names) {
    const value = argValue(name);
    if (value) return value;
  }
  return "";
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function selectorFromArgs(defaultSelector: SchoolPayoutSelector = {}): SchoolPayoutSelector {
  const selector = {
    centerId: firstArgValue("--center-id", "--centerId") || defaultSelector.centerId,
    locationId: firstArgValue("--location-id", "--locationId") || defaultSelector.locationId,
    crmLocationId: firstArgValue("--crm-location-id", "--crmLocationId") || defaultSelector.crmLocationId,
    name: firstArgValue("--name", "--center-name") || defaultSelector.name,
  };

  if (!hasSchoolPayoutSelector(selector)) {
    throw new Error("Pass --center-id, --location-id, --crm-location-id, or --name.");
  }

  return selector;
}

function setupArgsFromCli(defaultInput: SchoolPayoutSetupArgs = {}): SchoolPayoutSetupArgs {
  return {
    ...defaultInput,
    legalBusinessName: firstArgValue("--legal-business-name", "--legalBusinessName") || defaultInput.legalBusinessName,
    displayName: firstArgValue("--display-name", "--displayName") || defaultInput.displayName,
    payoutContactName: firstArgValue("--payout-contact-name", "--payoutContactName") || defaultInput.payoutContactName,
    payoutContactEmail: firstArgValue("--payout-contact-email", "--payoutContactEmail") || defaultInput.payoutContactEmail,
    payoutContactPhone: firstArgValue("--payout-contact-phone", "--payoutContactPhone") || defaultInput.payoutContactPhone,
    supportEmail: firstArgValue("--support-email", "--supportEmail") || defaultInput.supportEmail,
    supportPhone: firstArgValue("--support-phone", "--supportPhone") || defaultInput.supportPhone,
    addressLine1: firstArgValue("--address-line-1", "--addressLine1") || defaultInput.addressLine1,
    addressLine2: firstArgValue("--address-line-2", "--addressLine2") || defaultInput.addressLine2,
    city: firstArgValue("--city") || defaultInput.city,
    state: firstArgValue("--state") || defaultInput.state,
    postalCode: firstArgValue("--postal-code", "--postalCode") || defaultInput.postalCode,
    businessUrl: firstArgValue("--business-url", "--businessUrl") || defaultInput.businessUrl,
    productDescription: firstArgValue("--product-description", "--productDescription") || defaultInput.productDescription,
  };
}

export async function prepareSchoolPayoutOnboarding(options: PrepareOptions = {}) {
  const dryRun = hasFlag("--dry-run");
  const selector = selectorFromArgs(options.defaultSelector);
  const centers = await prisma.center.findMany({
    where: schoolPayoutCenterWhere(selector),
    orderBy: { name: "asc" },
    take: 5,
    select: {
      id: true,
      organizationId: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      customFields: true,
      organization: { select: { tenantId: true } },
    },
  });

  if (!centers.length) {
    throw new Error("No center matched the requested payout setup selector.");
  }
  if (centers.length > 1) {
    throw new Error(`Payout setup selector matched multiple centers: ${centers.map((center) => `${center.name} (${center.locationId || center.crmLocationId || center.id})`).join(", ")}`);
  }

  const center = centers[0];
  const setupInput = buildSchoolPayoutSetupInput(setupArgsFromCli(options.defaultInput), center);
  const setup = normalizeStripeConnectSetupInput(setupInput, center);
  if (!setup.ok) {
    console.error(JSON.stringify({ ok: false, center: center.name, errors: setup.errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const existingFields = jsonObject(center.customFields);
  let customFields = schoolPayoutSetupCustomFieldPatch({
    existingCustomFields: existingFields,
    setupDetails: setup.details,
    setupVersion: options.scriptVersion ?? SCHOOL_PAYOUT_SETUP_VERSION,
  });

  let accountId = readStripeConnectedAccountId(existingFields);
  const tenantId = center.organization.tenantId;
  const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId }));

  if (hasFlag("--create-link") && dryRun) {
    throw new Error("--dry-run cannot be combined with --create-link because onboarding link creation may create Stripe state.");
  }

  if (hasFlag("--create-link")) {
    if (!stripeConfigured) throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY before using --create-link.");
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
        tenantId,
      });
      if (!created.ok || !created.id) throw new Error(created.error || "Stripe connected account could not be created.");
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
    }
  }

  if (!dryRun) {
    await prisma.center.update({
      where: { id: center.id },
      data: {
        email: setup.details.payoutContactEmail || center.email,
        phone: setup.details.payoutContactPhone || center.phone,
        address: setup.details.addressLine1,
        city: setup.details.city,
        state: setup.details.state,
        postalCode: setup.details.postalCode,
        customFields,
      },
    });
  }

  let onboardingUrl: string | undefined;
  if (hasFlag("--create-link") && accountId) {
    const baseUrl = (argValue("--app-url") || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://thebeesuite.io").replace(/\/$/, "");
    const link = await createStripeAccountLink({
      accountId,
      refreshUrl: `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`,
      returnUrl: `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`,
      tenantId,
    });
    if (!link.ok || !link.url) throw new Error(link.error || "Stripe onboarding link could not be created.");
    onboardingUrl = link.url;
  }

  console.log(JSON.stringify({
    ok: true,
    centerId: center.id,
    centerName: center.name,
    locationId: center.locationId || center.crmLocationId,
    stripeConfigured,
    stripeConnectedAccountId: accountId || null,
    profileReady: true,
    dryRun,
    writeApplied: !dryRun,
    onboardingUrl: onboardingUrl || null,
    nextStep: onboardingUrl
      ? `Open onboardingUrl and enter ${center.name} bank account/routing details in Stripe.`
      : dryRun
        ? `Dry run passed. Rerun without --dry-run to save the payout profile for ${center.name}.`
      : `Run with --create-link after Stripe keys are available, or use Billing Settings > ${center.name} > Set up.`,
  }, null, 2));
}

export async function runPrepareSchoolPayoutOnboarding(options: PrepareOptions = {}) {
  try {
    await prepareSchoolPayoutOnboarding(options);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedScriptUrl) {
  void runPrepareSchoolPayoutOnboarding();
}
