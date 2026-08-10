import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  createStripeAccountLink,
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { getSecurePaymentAppBaseUrl } from "@/lib/payment-redirect-security";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration, stripeConnectMigrationTargetIsReady } from "@/lib/stripe-connect-migration";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

async function authorizedCenter(request: NextRequest, method: "GET" | "POST") {
  const user = await getCurrentUser();
  const body = method === "POST" ? await request.json().catch(() => ({})) as { centerId?: unknown; authorizedRepresentative?: unknown } : {};
  if (!user) return { response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }), user: null, center: null, body };
  if (!canManageBilling(user) && !canManageOperations(user)) {
    return { response: NextResponse.json({ ok: false, error: "Stripe migration is not allowed for this role." }, { status: 403 }), user: null, center: null, body };
  }
  const centerId = method === "POST"
    ? clean(body.centerId) || user.primaryCenterId
    : request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId || !canAccessCenter(user, centerId)) {
    return { response: NextResponse.json({ ok: false, error: "Choose a school you are allowed to manage." }, { status: 403 }), user: null, center: null, body };
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, crmLocationId: true, customFields: true },
  });
  if (!center) return { response: NextResponse.json({ ok: false, error: "School not found." }, { status: 404 }), user: null, center: null, body };
  return { response: null, user, center, body };
}

async function GETHandler(request: NextRequest) {
  const auth = await authorizedCenter(request, "GET");
  if (auth.response) return auth.response;
  if (!auth.user || !auth.center) return NextResponse.json({ ok: false, error: "Authorization could not be verified." }, { status: 403 });
  const { user, center } = auth;
  const fields = jsonObject(center.customFields);
  const migration = readStripeConnectMigration(fields);
  if (!migration.targetAccountId || !migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "This school does not have a prepared Stripe migration." }, { status: 409 });
  }
  if (readStripeConnectedAccountId(fields) !== migration.sourceAccountId && !migration.cutoverAt) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Migration status was not updated." }, { status: 409 });
  }

  const [target, banks] = await Promise.all([
    retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId }),
    listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: user.tenantId }),
  ]);
  if (!target.ok || !target.account) {
    return NextResponse.json({ ok: false, error: target.error || "The new Stripe account could not be checked." }, { status: target.configured ? 502 : 503 });
  }
  if (!banks.ok) {
    return NextResponse.json({ ok: false, error: banks.error || "The new payout bank could not be checked." }, { status: banks.configured ? 502 : 503 });
  }
  const payoutBank = banks.defaultBank;
  const targetReady = stripeConnectMigrationTargetIsReady({
    chargesEnabled: target.account.chargesEnabled,
    payoutsEnabled: target.account.payoutsEnabled,
    detailsSubmitted: target.account.detailsSubmitted,
    requirementFields: target.account.requirementFields,
    feesCollector: target.account.feesCollector,
    lossesCollector: target.account.lossesCollector,
    payoutBankLast4: payoutBank?.last4,
  });
  const balanceAuthorized = Boolean(clean(fields.stripeConnectMigrationBalanceApprovalAt));
  const status = targetReady
    ? balanceAuthorized ? "ready_for_cutover" : "balance_authorization_required"
    : target.account.requirementFields.length ? "requirements_due" : "onboarding_opened";
  const syncedAt = new Date().toISOString();
  const patch: Prisma.JsonObject = {
    stripeConnectMigrationStatus: status,
    stripeConnectMigrationTargetChargesEnabled: target.account.chargesEnabled,
    stripeConnectMigrationTargetPayoutsEnabled: target.account.payoutsEnabled,
    stripeConnectMigrationTargetDetailsSubmitted: target.account.detailsSubmitted,
    stripeConnectMigrationTargetRequirementFields: target.account.requirementFields,
    stripeConnectMigrationTargetFeesCollector: target.account.feesCollector,
    stripeConnectMigrationTargetLossesCollector: target.account.lossesCollector,
    stripeConnectMigrationTargetPayoutBankName: payoutBank?.bankName || null,
    stripeConnectMigrationTargetPayoutBankLast4: payoutBank?.last4 || null,
    stripeConnectMigrationTargetPayoutBankStatus: payoutBank?.status || null,
    stripeConnectMigrationTargetPayoutBankCount: banks.banks.length,
    stripeConnectMigrationLastSyncedAt: syncedAt,
  };
  await prisma.center.update({ where: { id: center.id }, data: { customFields: { ...fields, ...patch } } });
  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.migration.status_synced",
    resource: "Center",
    resourceId: center.id,
    metadata: { sourceAccountId: migration.sourceAccountId, targetAccountId: migration.targetAccountId, status, payoutBankConfirmed: Boolean(payoutBank?.last4) },
  });
  return NextResponse.json({ ok: true, centerId: center.id, status, target: target.account, payoutBank, payoutBankCount: banks.banks.length, patch });
}

async function POSTHandler(request: NextRequest) {
  const auth = await authorizedCenter(request, "POST");
  if (auth.response) return auth.response;
  if (!auth.user || !auth.center) return NextResponse.json({ ok: false, error: "Authorization could not be verified." }, { status: 403 });
  const { user, center } = auth;
  if (auth.body.authorizedRepresentative !== true) {
    return NextResponse.json({ ok: false, error: "Confirm that you are authorized to act for this school before continuing." }, { status: 400 });
  }
  const fields = jsonObject(center.customFields);
  const migration = readStripeConnectMigration(fields);
  if (!migration.targetAccountId || !migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "This school does not have a prepared Stripe migration." }, { status: 409 });
  }
  if (migration.cutoverAt) {
    return NextResponse.json({ ok: false, error: "This school's Stripe migration is already complete." }, { status: 409 });
  }
  if (readStripeConnectedAccountId(fields) !== migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Reauthorization was stopped." }, { status: 409 });
  }
  const target = await retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId });
  if (!target.ok || !target.account || target.account.feesCollector !== "stripe" || target.account.lossesCollector !== "stripe") {
    return NextResponse.json({ ok: false, error: target.error || "The prepared Stripe account has the wrong fee or loss responsibility." }, { status: target.configured ? 409 : 503 });
  }
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const returnUrl = `${baseUrl}/stripe-reauthorization?stripeMigration=return&center=${encodeURIComponent(center.id)}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/migration/refresh?centerId=${encodeURIComponent(center.id)}`;
  const link = await createStripeAccountLink({ accountId: migration.targetAccountId, refreshUrl, returnUrl, tenantId: user.tenantId });
  if (!link.ok || !link.url) {
    return NextResponse.json({ ok: false, error: link.error || "The secure reauthorization link could not be opened." }, { status: link.configured ? 502 : 503 });
  }
  await prisma.center.update({
    where: { id: center.id },
    data: { customFields: { ...fields, stripeConnectMigrationStatus: "onboarding_opened", stripeConnectMigrationLastOnboardingAt: new Date().toISOString(), stripeConnectMigrationLinksSent: false } },
  });
  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.migration.onboarding_opened",
    resource: "Center",
    resourceId: center.id,
    metadata: { sourceAccountId: migration.sourceAccountId, targetAccountId: migration.targetAccountId, authorizedRepresentativeConfirmed: true, linkStored: false, linkSent: false },
  });
  return NextResponse.json({ ok: true, url: link.url, centerId: center.id });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
