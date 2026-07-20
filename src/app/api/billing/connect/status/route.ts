import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { getStripeSecretKey, readStripeConnectedAccountId, retrieveStripeConnectedAccount } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { stripeConnectCustomFieldPatch, stripeConnectReadinessFromFields, stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!canManageBilling(user) && !canManageOperations(user)) {
    return NextResponse.json({ ok: false, error: "Payout status is not allowed for this role." }, { status: 403 });
  }

  const centerId = request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId) {
    return NextResponse.json({ ok: false, error: "Choose a center before checking payout status." }, { status: 400 });
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
      customFields: true,
    },
  });

  if (!center) {
    return NextResponse.json({ ok: false, error: "Center not found." }, { status: 404 });
  }

  const existingFields = jsonObject(center.customFields);
  const accountId = readStripeConnectedAccountId(existingFields);
  if (!accountId) {
    const readiness = stripeConnectReadinessFromFields(existingFields);
    const billingApproval = stripeSchoolBillingApproval({ customFields: existingFields, centerName: center.name });
    return NextResponse.json({
      ok: true,
      configured: Boolean(await getStripeSecretKey({ tenantId: user.tenantId })),
      centerId: center.id,
      account: null,
      status: "not_started",
      readiness,
      billingApproval,
    });
  }

  const retrieved = await retrieveStripeConnectedAccount(accountId, { tenantId: user.tenantId });
  if (!retrieved.ok || !retrieved.account) {
    return NextResponse.json(
      { ok: false, configured: retrieved.configured, error: retrieved.error || "Payout status could not be checked." },
      { status: retrieved.configured ? 502 : 503 },
    );
  }

  const readiness = stripeConnectReadinessFromSnapshot(retrieved.account);
  const billingApproval = stripeSchoolBillingApproval({ customFields: existingFields, centerName: center.name });

  await prisma.center.update({
    where: { id: center.id },
    data: {
      customFields: {
        ...existingFields,
        ...stripeConnectCustomFieldPatch(readiness),
        stripeMerchantCapabilityStatus: retrieved.account.merchantCapabilityStatus || null,
        stripeRecipientTransferStatus: retrieved.account.recipientTransferStatus || null,
      },
    },
  });

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.status_synced",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      stripeConnectedAccountId: accountId,
      status: readiness.status,
      requirementCount: retrieved.account.requirementFields.length,
    },
  });

  return NextResponse.json({
    ok: true,
    configured: true,
    centerId: center.id,
    status: readiness.status,
    readiness,
    billingApproval,
    account: retrieved.account,
  });
}

export const GET = withApiLogging("GET", GETHandler);
