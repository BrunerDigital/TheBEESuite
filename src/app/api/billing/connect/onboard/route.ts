import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeAccountLink,
  createStripeConnectedAccount,
  getStripeSecretKey,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
  setStripeConnectedAccountDailyPayouts,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import {
  STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE,
  normalizeStripeConnectSetupInput,
  stripeConnectSetupCustomFieldPatch,
  type StripeConnectSetupInput,
  verifyStripeConnectAccountBinding,
} from "@/lib/stripe-connect-setup";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  return getSecurePaymentAppBaseUrl(request.url);
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function stripeConnectFailureMessage(error: string | undefined, fallback: string) {
  const message = clean(error);
  if (/permission denied|does not have permission|forbidden/i.test(message)) {
    return STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE;
  }
  if (/invalid api key|expired api key|no api key/i.test(message)) {
    return "The payment processor rejected the payout setup because the configured API key is invalid. Update the live processor key, then try again.";
  }
  return message || fallback;
}

function stripeConnectFailurePatch(status: string, error: string | undefined): Prisma.JsonObject {
  return {
    stripePayoutStatus: status,
    stripeConnectLastError: stripeConnectFailureMessage(error, "Payout onboarding could not be started.").slice(0, 240),
    stripeConnectLastSyncedAt: new Date().toISOString(),
  };
}

async function updateCenterCustomFieldsIfCurrent(
  centerId: string,
  expected: Prisma.JsonValue | null,
  next: Prisma.JsonObject,
) {
  const updated = await prisma.center.updateMany({
    where: {
      id: centerId,
      customFields: expected === null
        ? { equals: Prisma.DbNull }
        : { equals: expected as Prisma.InputJsonValue },
    },
    data: { customFields: next },
  });
  return updated.count === 1;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Payout setup is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { centerId?: unknown; setup?: unknown };
  const centerId = clean(body.centerId) || user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Choose a center before starting payout setup." }, { status: 400 });
  }
  if (!canAccessCenter(user, centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this center." }, { status: 403 });
  }

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      customFields: true,
    },
  });

  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }

  const existingFields = jsonObject(center.customFields);
  const migration = readStripeConnectMigration(existingFields);
  if (migration.targetAccountId && !migration.cutoverAt) {
    return NextResponse.json(
      { ok: false, error: "This school has a prepared replacement Stripe account. Use Reauthorize new Stripe account so parent payments remain on the current account until cutover." },
      { status: 409 },
    );
  }
  const setupInput = body.setup && typeof body.setup === "object" && !Array.isArray(body.setup)
    ? body.setup as StripeConnectSetupInput
    : {};
  const setup = normalizeStripeConnectSetupInput(setupInput, center);
  if (!setup.ok) {
    return NextResponse.json(
      { ok: false, error: "Complete the required payout setup fields before opening the secure payout handoff.", fields: setup.errors },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  let currentFields: Prisma.JsonObject = {
    ...existingFields,
    ...(stripeConnectSetupCustomFieldPatch(setup.details) as Prisma.JsonObject),
    stripeConnectSetupUpdatedAt: now,
    stripeConnectSetupVersion: "2026-06-dashboard-v1",
    stripeFundsFlow: "connected_account_direct_charge_application_fee",
    stripePayoutCollectionMode: "stripe_automatic",
    stripePayoutSchedulePreference: "fastest_available",
    stripeSoftwarePaymentPreference: clean(existingFields.stripeSoftwarePaymentPreference) || "payout_bank",
    stripeSoftwarePaymentStatus: clean(existingFields.stripeSoftwareDefaultPaymentMethodId) ? "ready" : "authorization_required",
  };
  const profileFields = currentFields;
  let accountId = readStripeConnectedAccountId(existingFields);
  let createdAccount = false;

  const profileSaved = await prisma.center.updateMany({
    where: {
      id: center.id,
      customFields: center.customFields === null
        ? { equals: Prisma.DbNull }
        : { equals: existingFields as Prisma.InputJsonValue },
    },
    data: {
      email: setup.details.payoutContactEmail || center.email,
      phone: setup.details.payoutContactPhone || center.phone,
      address: setup.details.addressLine1 || center.address,
      city: setup.details.city || center.city,
      state: setup.details.state || center.state,
      postalCode: setup.details.postalCode || center.postalCode,
      customFields: currentFields,
    },
  });
  if (profileSaved.count !== 1) {
    return NextResponse.json(
      { ok: false, error: "This school's payout settings changed while setup was opening. Refresh and try again." },
      { status: 409 },
    );
  }

  const stripeSecretKey = await getStripeSecretKey({ tenantId: user.tenantId });
  if (!stripeSecretKey) {
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.connect.setup_profile_saved",
      resource: "Center",
      resourceId: center.id,
      metadata: {
        crmLocationId: center.crmLocationId || null,
        stripeConfigured: false,
      },
    });

    return NextResponse.json({
      ok: true,
      saved: true,
      configured: false,
      stripeConfigured: false,
      centerId: center.id,
      message: "Payout setup profile was saved. Add payment processor keys before creating the onboarding link.",
    });
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
      tenantId: user.tenantId,
      idempotencyKey: `bee-suite-school-connect-v2-${center.id}`,
      metadata: {
        beeSuiteCenterId: center.id,
        beeSuiteCrmLocationId: center.crmLocationId,
        beeSuiteTenantId: user.tenantId,
      },
    });

    if (!created.ok || !created.id) {
      const errorMessage = stripeConnectFailureMessage(created.error, "Connected payout account could not be created.");
      await updateCenterCustomFieldsIfCurrent(center.id, currentFields, {
        ...currentFields,
        ...stripeConnectFailurePatch("account_creation_failed", created.error),
      });
      return NextResponse.json(
        { ok: false, configured: created.configured, error: errorMessage },
        { status: created.configured ? 502 : 503 },
      );
    }

    accountId = created.id;
    createdAccount = true;
    const readiness = created.account ? stripeConnectReadinessFromSnapshot(created.account) : null;
    currentFields = {
      ...currentFields,
      stripeConnectAccountId: accountId,
      ...(readiness ? stripeConnectCustomFieldPatch(readiness) : {}),
      stripePayoutStatus: "onboarding_started",
      stripeConnectDashboard: created.account?.dashboard || "full",
      stripeConnectApi: "accounts_v2",
      stripeConnectCreatedAt: new Date().toISOString(),
    };
    const mapped = await updateCenterCustomFieldsIfCurrent(center.id, profileFields, currentFields);
    if (!mapped) {
      const fresh = await prisma.center.findUnique({ where: { id: center.id }, select: { customFields: true } });
      const freshFields = jsonObject(fresh?.customFields);
      if (readStripeConnectedAccountId(freshFields) !== accountId) {
        return NextResponse.json(
          { ok: false, error: "This school's Stripe account mapping changed while setup was opening. Refresh before continuing." },
          { status: 409 },
        );
      }
      currentFields = freshFields;
    }
  } else {
    const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: user.tenantId });
    const binding = verifyStripeConnectAccountBinding(accountId, retrieved.account?.id);
    if (!retrieved.ok || !retrieved.account || !binding.ok) {
      const retrievalFailed = !retrieved.ok || !retrieved.account;
      const errorMessage = retrievalFailed
        ? stripeConnectFailureMessage(
            retrieved.error,
            "The school's designated payout account could not be verified. Payout onboarding was stopped.",
          )
        : !binding.ok
          ? binding.error
          : "The school's designated payout account could not be verified. Payout onboarding was stopped.";
      await updateCenterCustomFieldsIfCurrent(center.id, currentFields, {
        ...currentFields,
        ...stripeConnectFailurePatch("account_mapping_verification_failed", errorMessage),
      });
      await writeAuditLog(user, {
        centerId: center.id,
        action: "billing.connect.account_mapping_verification_failed",
        resource: "Center",
        resourceId: center.id,
        metadata: {
          stripeConnectedAccountId: accountId,
          crmLocationId: center.crmLocationId || null,
        },
      });
      return NextResponse.json(
        { ok: false, configured: retrieved.configured, error: errorMessage },
        { status: retrievalFailed ? (retrieved.configured ? 502 : 503) : 409 },
      );
    }

    const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
    currentFields = {
      ...currentFields,
      ...stripeConnectCustomFieldPatch(readiness),
      stripeConnectAccountId: binding.accountId,
    };
    if (!await updateCenterCustomFieldsIfCurrent(center.id, profileFields, currentFields)) {
      return NextResponse.json(
        { ok: false, error: "This school's Stripe connection changed while status was refreshing. Refresh and try again." },
        { status: 409 },
      );
    }
  }

  const payoutSchedule = await setStripeConnectedAccountDailyPayouts({ accountId, tenantId: user.tenantId });
  const beforeScheduleFields = currentFields;
  currentFields = {
    ...currentFields,
    stripeConnectAccountId: accountId,
    stripePayoutScheduleInterval: payoutSchedule.ok ? "daily" : "default",
    stripePayoutDelayPolicy: payoutSchedule.ok ? "lowest_available" : "unchanged",
    stripePayoutScheduleStatus: payoutSchedule.ok ? "daily_automatic_configured" : "schedule_update_failed",
    stripePayoutScheduleLastSyncedAt: new Date().toISOString(),
    ...(payoutSchedule.ok
      ? { stripePayoutScheduleLastError: null }
      : { stripePayoutScheduleLastError: clean(payoutSchedule.error).slice(0, 240) || "Daily automatic payout schedule could not be configured." }),
  };
  if (!await updateCenterCustomFieldsIfCurrent(center.id, beforeScheduleFields, currentFields)) {
    return NextResponse.json(
      { ok: false, error: "This school's Stripe connection changed while payout scheduling was saved. Refresh and try again." },
      { status: 409 },
    );
  }

  const baseUrl = requestBaseUrl(request);
  const returnUrl = `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId, refreshUrl, returnUrl, tenantId: user.tenantId });

  if (!link.ok || !link.url) {
    const errorMessage = stripeConnectFailureMessage(link.error, "Payout onboarding link could not be created.");
    await updateCenterCustomFieldsIfCurrent(center.id, currentFields, {
      ...currentFields,
      stripeConnectAccountId: accountId,
      ...stripeConnectFailurePatch("onboarding_link_failed", link.error),
    });
    return NextResponse.json(
      { ok: false, configured: link.configured, error: errorMessage },
      { status: link.configured ? 502 : 503 },
    );
  }

  const linkFields: Prisma.JsonObject = {
    ...currentFields,
    stripeConnectAccountId: accountId,
    stripePayoutStatus: "onboarding_link_created",
    stripeConnectDashboard: "full",
    stripeConnectApi: "accounts_v2",
    stripeConnectLastOnboardingAt: new Date().toISOString(),
  };
  if (!await updateCenterCustomFieldsIfCurrent(center.id, currentFields, linkFields)) {
    return NextResponse.json(
      { ok: false, error: "This school's Stripe connection changed before the secure handoff opened. Refresh and try again." },
      { status: 409 },
    );
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: createdAccount ? "billing.connect.account_created" : "billing.connect.onboarding_link_created",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      crmLocationId: center.crmLocationId || null,
      setupProfileSaved: true,
    },
  });

  return NextResponse.json({
    ok: true,
    url: link.url,
    centerId: center.id,
    accountId,
    createdAccount,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
