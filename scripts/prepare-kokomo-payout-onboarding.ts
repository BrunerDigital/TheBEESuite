import "./load-env";
import { Prisma } from "@prisma/client";
import { createStripeAccountLink, createStripeConnectedAccount, getStripeSecretKey, readStripeConnectedAccountId } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { normalizeStripeConnectSetupInput, stripeConnectSetupCustomFieldPatch, type StripeConnectSetupInput } from "@/lib/stripe-connect-setup";

const KOKOMO_LOCATION_ID = "IN | Kokomo";
const KOKOMO_DEFAULTS: StripeConnectSetupInput = {
  legalBusinessName: "Kid City USA - Kokomo",
  displayName: "Kid City USA - Kokomo",
  addressLine1: "1998 Bent Creek Road",
  city: "Kokomo",
  state: "IN",
  postalCode: "46901",
  productDescription: "Childcare tuition, registration fees, deposits, and Kokomo school account payouts.",
};

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function argValue(name: string) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : "";
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

async function main() {
  const center = await prisma.center.findFirst({
    where: {
      OR: [
        { locationId: KOKOMO_LOCATION_ID },
        { crmLocationId: KOKOMO_LOCATION_ID },
        { name: { contains: "Kokomo", mode: "insensitive" } },
      ],
    },
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

  if (!center) throw new Error("Kokomo center was not found. Import/sync Kid City locations before payout setup.");

  const setupInput: StripeConnectSetupInput = {
    ...KOKOMO_DEFAULTS,
    payoutContactName: argValue("--payout-contact-name"),
    payoutContactEmail: argValue("--payout-contact-email") || center.email || undefined,
    payoutContactPhone: argValue("--payout-contact-phone") || center.phone || undefined,
    supportEmail: argValue("--support-email") || argValue("--payout-contact-email") || center.email || undefined,
    supportPhone: argValue("--support-phone") || argValue("--payout-contact-phone") || center.phone || undefined,
    businessUrl: argValue("--business-url"),
  };

  const setup = normalizeStripeConnectSetupInput(setupInput, center);
  if (!setup.ok) {
    console.error(JSON.stringify({ ok: false, center: center.name, errors: setup.errors }, null, 2));
    process.exitCode = 1;
    return;
  }

  const existingFields = jsonObject(center.customFields);
  let customFields: Prisma.JsonObject = {
    ...existingFields,
    ...(stripeConnectSetupCustomFieldPatch(setup.details) as Prisma.JsonObject),
    stripeConnectSetupUpdatedAt: new Date().toISOString(),
    stripeConnectSetupVersion: "2026-06-kokomo-payout-script-v1",
    stripePayoutStatus: readStripeConnectedAccountId(existingFields) ? existingFields.stripePayoutStatus ?? "account_created" : "profile_ready",
  };

  let accountId = readStripeConnectedAccountId(existingFields);
  const tenantId = center.organization.tenantId;
  const stripeConfigured = Boolean(await getStripeSecretKey({ tenantId }));

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
    onboardingUrl: onboardingUrl || null,
    nextStep: onboardingUrl
      ? "Open onboardingUrl and enter Kokomo bank account/routing details in Stripe."
      : "Run with --create-link after Stripe keys are available, or use Billing Settings > Kokomo > Set up.",
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
