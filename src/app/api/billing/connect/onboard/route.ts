import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeAccountLink,
  createStripeConnectedAccount,
  getStripeSecretKey,
  readStripeConnectedAccountId,
  setStripeConnectedAccountDailyPayouts,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import {
  STRIPE_CONNECT_RESTRICTED_KEY_FIX_MESSAGE,
  normalizeStripeConnectSetupInput,
  stripeConnectSetupCustomFieldPatch,
  type StripeConnectSetupInput,
} from "@/lib/stripe-connect-setup";
import { getAppBaseUrl } from "@/lib/supabase-auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  return getAppBaseUrl(request.url);
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
  };
  let accountId = readStripeConnectedAccountId(existingFields);
  let createdAccount = false;

  await prisma.center.update({
    where: { id: center.id },
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
    });

    if (!created.ok || !created.id) {
      const errorMessage = stripeConnectFailureMessage(created.error, "Connected payout account could not be created.");
      await prisma.center.update({
        where: { id: center.id },
        data: {
          customFields: {
            ...currentFields,
            ...stripeConnectFailurePatch("account_creation_failed", created.error),
          },
        },
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
      stripeConnectDashboard: "express",
      stripeConnectApi: "accounts_v2",
      stripeConnectCreatedAt: new Date().toISOString(),
    };
    await prisma.center.update({
      where: { id: center.id },
      data: {
        customFields: currentFields,
      },
    });
  }

  const payoutSchedule = await setStripeConnectedAccountDailyPayouts({ accountId, tenantId: user.tenantId });
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
  await prisma.center.update({
    where: { id: center.id },
    data: { customFields: currentFields },
  });

  const baseUrl = requestBaseUrl(request);
  const returnUrl = `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId, refreshUrl, returnUrl, tenantId: user.tenantId });

  if (!link.ok || !link.url) {
    const errorMessage = stripeConnectFailureMessage(link.error, "Payout onboarding link could not be created.");
    await prisma.center.update({
      where: { id: center.id },
      data: {
        customFields: {
          ...currentFields,
          stripeConnectAccountId: accountId,
          ...stripeConnectFailurePatch("onboarding_link_failed", link.error),
        },
      },
    });
    return NextResponse.json(
      { ok: false, configured: link.configured, error: errorMessage },
      { status: link.configured ? 502 : 503 },
    );
  }

  await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: {
        ...currentFields,
        stripeConnectAccountId: accountId,
        stripePayoutStatus: "onboarding_link_created",
        stripeConnectDashboard: "express",
        stripeConnectApi: "accounts_v2",
        stripeConnectLastOnboardingAt: new Date().toISOString(),
      },
    },
  });

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
