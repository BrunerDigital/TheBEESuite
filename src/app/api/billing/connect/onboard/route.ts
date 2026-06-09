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

  const body = await request.json().catch(() => ({})) as { centerId?: unknown };
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
  let currentFields = existingFields;
  let accountId = readStripeConnectedAccountId(existingFields);
  let createdAccount = false;

  if (!accountId) {
    const created = await createStripeConnectedAccount({
      businessName: center.name,
      email: center.email,
      phone: center.phone,
      address: center.address,
      city: center.city,
      state: center.state,
      postalCode: center.postalCode,
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
      ...existingFields,
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
