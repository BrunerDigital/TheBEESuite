import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeAccountLink,
  createStripeConnectedAccount,
  readStripeConnectedAccountId,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import {
  normalizeStripeConnectSetupInput,
  stripeConnectSetupCustomFieldPatch,
  type StripeConnectSetupInput,
} from "@/lib/stripe-connect-setup";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  return request.nextUrl.origin;
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
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
      { ok: false, error: "Complete the required payout setup fields before continuing to Stripe.", fields: setup.errors },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  let currentFields: Prisma.JsonObject = {
    ...existingFields,
    ...(stripeConnectSetupCustomFieldPatch(setup.details) as Prisma.JsonObject),
    stripeConnectSetupUpdatedAt: now,
    stripeConnectSetupVersion: "2026-06-dashboard-v1",
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
      return NextResponse.json(
        { ok: false, configured: created.configured, error: created.error || "Connected payout account could not be created." },
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

  const baseUrl = requestBaseUrl(request);
  const returnUrl = `${baseUrl}/billing-settings?stripeConnect=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId, refreshUrl, returnUrl, tenantId: user.tenantId });

  if (!link.ok || !link.url) {
    return NextResponse.json(
      { ok: false, configured: link.configured, error: link.error || "Payout onboarding link could not be created." },
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
