import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import {
  authorizeCorporateStripeVerificationCenter,
  corporateStripePayoutBankIsConfirmed,
  corporateStripeVerificationBindingIsValid,
  readCorporateStripeVerificationTarget,
  stripeVerificationState,
} from "@/lib/corporate-stripe-verification";
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
  const body = method === "POST" ? await request.json().catch(() => ({})) as {
    centerId?: unknown;
    authorizedRepresentative?: unknown;
    termsAccepted?: unknown;
    returnToCorporatePortfolio?: unknown;
  } : {};
  if (!user) return { response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }), user: null, center: null, body, corporateVerification: false };
  const centerId = method === "POST"
    ? clean(body.centerId) || user.primaryCenterId
    : request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId) {
    return { response: NextResponse.json({ ok: false, error: "Choose a school you are allowed to manage." }, { status: 403 }), user: null, center: null, body, corporateVerification: false };
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, crmLocationId: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) return { response: NextResponse.json({ ok: false, error: "School not found." }, { status: 404 }), user: null, center: null, body, corporateVerification: false };

  const approvedTarget = readCorporateStripeVerificationTarget(center.id);
  if (approvedTarget) {
    const authorization = await authorizeCorporateStripeVerificationCenter({ user, center });
    if (!authorization.ok) {
      const targetChanged = authorization.reason === "target_changed";
      return {
        response: NextResponse.json(
          { ok: false, error: targetChanged ? "The approved Stripe verification account changed. Setup was stopped." : "Corporate Stripe verification is not allowed for this account." },
          { status: targetChanged ? 409 : 403 },
        ),
        user: null,
        center: null,
        body,
        corporateVerification: false,
      };
    }
    return { response: null, user, center, body, corporateVerification: true };
  }

  if ((!canManageBilling(user) && !canManageOperations(user)) || !canAccessCenter(user, center.id)) {
    return { response: NextResponse.json({ ok: false, error: "Stripe migration is not allowed for this role or school." }, { status: 403 }), user: null, center: null, body, corporateVerification: false };
  }
  return { response: null, user, center, body, corporateVerification: false };
}

async function GETHandler(request: NextRequest) {
  const auth = await authorizedCenter(request, "GET");
  if (auth.response) return auth.response;
  if (!auth.user || !auth.center) return NextResponse.json({ ok: false, error: "Authorization could not be verified." }, { status: 403 });
  const { user, center, corporateVerification } = auth;
  const fields = jsonObject(center.customFields);
  const migration = readStripeConnectMigration(fields);
  if (!migration.targetAccountId || !migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "This school does not have a prepared Stripe migration." }, { status: 409 });
  }
  const activeAccountId = readStripeConnectedAccountId(fields);
  if (corporateVerification && !corporateStripeVerificationBindingIsValid({
    activeAccountId,
    sourceAccountId: migration.sourceAccountId,
    targetAccountId: migration.targetAccountId,
    cutoverAt: migration.cutoverAt,
  })) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Verification status was not updated." }, { status: 409 });
  }
  if (!corporateVerification && activeAccountId !== migration.sourceAccountId && !migration.cutoverAt) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Migration status was not updated." }, { status: 409 });
  }

  if (corporateVerification) {
    const [target, banks] = await Promise.all([
      retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: user.tenantId }),
    ]);
    if (!target.ok || !target.account) {
      return NextResponse.json({ ok: false, error: target.error || "The Stripe verification account could not be checked." }, { status: target.configured ? 502 : 503 });
    }
    if (!banks.ok) {
      return NextResponse.json({ ok: false, error: banks.error || "The Stripe payout bank could not be checked." }, { status: banks.configured ? 502 : 503 });
    }
    const payoutBank = banks.defaultBank;
    const verificationStatus = stripeVerificationState(target.account, corporateStripePayoutBankIsConfirmed(banks.banks));
    const migrationStatus = verificationStatus === "stripe_verification_complete"
      ? "ready_for_cutover"
      : verificationStatus === "stripe_verification_required"
        ? "requirements_due"
        : "onboarding_opened";
    const syncedAt = new Date().toISOString();
    const patch: Prisma.JsonObject = {
      stripeConnectMigrationStatus: migrationStatus,
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
    const synced = await prisma.center.updateMany({
      where: { id: center.id, customFields: { equals: fields as Prisma.InputJsonValue } },
      data: { customFields: { ...fields, ...patch } },
    });
    if (synced.count !== 1) {
      return NextResponse.json({ ok: false, error: "The school's Stripe verification changed while status was refreshing. Refresh and try again." }, { status: 409 });
    }
    await writeAuditLog(user, {
      centerId: center.id,
      action: "billing.connect.migration.status_synced",
      resource: "Center",
      resourceId: center.id,
      metadata: { sourceAccountId: migration.sourceAccountId, targetAccountId: migration.targetAccountId, status: migrationStatus, payoutBankConfirmed: Boolean(payoutBank?.last4) },
    });
    return NextResponse.json({ ok: true, centerId: center.id, status: verificationStatus });
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
  const status = targetReady
    ? "ready_for_cutover"
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
  const synced = await prisma.center.updateMany({
    where: {
      id: center.id,
      customFields: { equals: fields as Prisma.InputJsonValue },
    },
    data: { customFields: { ...fields, ...patch } },
  });
  if (synced.count !== 1) {
    return NextResponse.json({ ok: false, error: "The school's Stripe migration changed while status was refreshing. Refresh and try again." }, { status: 409 });
  }
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
  const { user, center, corporateVerification } = auth;
  if (auth.body.authorizedRepresentative !== true || auth.body.termsAccepted !== true) {
    return NextResponse.json({ ok: false, error: "Agree to the terms of service and confirm that you are authorized to act for this school before continuing." }, { status: 400 });
  }
  const fields = jsonObject(center.customFields);
  const migration = readStripeConnectMigration(fields);
  if (!migration.targetAccountId || !migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "This school does not have a prepared Stripe migration." }, { status: 409 });
  }
  if (migration.cutoverAt && !corporateVerification) {
    return NextResponse.json({ ok: false, error: "This school's Stripe migration is already complete." }, { status: 409 });
  }
  const activeAccountId = readStripeConnectedAccountId(fields);
  if (corporateVerification && !corporateStripeVerificationBindingIsValid({
    activeAccountId,
    sourceAccountId: migration.sourceAccountId,
    targetAccountId: migration.targetAccountId,
    cutoverAt: migration.cutoverAt,
  })) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Verification was stopped." }, { status: 409 });
  }
  if (!corporateVerification && activeAccountId !== migration.sourceAccountId) {
    return NextResponse.json({ ok: false, error: "The school's active parent-payment account changed. Reauthorization was stopped." }, { status: 409 });
  }
  const target = await retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId });
  if (!target.ok || !target.account) {
    return NextResponse.json({ ok: false, error: target.error || "The prepared Stripe account could not be checked." }, { status: target.configured ? 502 : 503 });
  }
  if (!corporateVerification && (target.account.feesCollector !== "stripe" || target.account.lossesCollector !== "stripe")) {
    return NextResponse.json({ ok: false, error: target.error || "The prepared Stripe account has the wrong fee or loss responsibility." }, { status: target.configured ? 409 : 503 });
  }
  if (corporateVerification) {
    const banks = await listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: user.tenantId });
    if (!banks.ok) {
      return NextResponse.json({ ok: false, error: banks.error || "The Stripe payout bank could not be checked." }, { status: banks.configured ? 502 : 503 });
    }
    const verificationStatus = stripeVerificationState(target.account, corporateStripePayoutBankIsConfirmed(banks.banks));
    if (verificationStatus === "stripe_verification_blocked") {
      return NextResponse.json({ ok: false, status: verificationStatus, error: "This Stripe account is not eligible for the approved verification flow. No session was created." }, { status: 409 });
    }
    if (verificationStatus !== "stripe_verification_required") {
      return NextResponse.json({
        ok: true,
        centerId: center.id,
        status: verificationStatus,
        alreadyComplete: verificationStatus === "stripe_verification_complete",
        pendingVerification: verificationStatus === "stripe_verification_pending",
      });
    }
  }
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const returnToCorporatePortfolio = corporateVerification || auth.body.returnToCorporatePortfolio === true;
  const portfolioQuery = returnToCorporatePortfolio ? "&portfolio=corporate" : "";
  const returnUrl = `${baseUrl}/stripe-reauthorization?stripeMigration=return&center=${encodeURIComponent(center.id)}${portfolioQuery}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/migration/refresh?centerId=${encodeURIComponent(center.id)}${portfolioQuery}`;
  const onboardingOpenedAt = new Date().toISOString();
  const reservedFields: Prisma.JsonObject = {
    ...fields,
    stripeConnectMigrationStatus: "onboarding_opened",
    stripeConnectMigrationLastOnboardingAt: onboardingOpenedAt,
    stripeConnectMigrationLinksSent: false,
  };
  const reserved = await prisma.center.updateMany({
    where: {
      id: center.id,
      customFields: { equals: fields as Prisma.InputJsonValue },
    },
    data: { customFields: reservedFields },
  });
  if (reserved.count !== 1) {
    return NextResponse.json({ ok: false, error: "The school's Stripe migration changed while setup was opening. Refresh and try again." }, { status: 409 });
  }
  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.migration.onboarding_reserved",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      sourceAccountId: migration.sourceAccountId,
      targetAccountId: migration.targetAccountId,
      authorizedRepresentativeConfirmed: true,
      termsAccepted: true,
      corporateVerification,
      returnToCorporatePortfolio,
      linkStored: false,
      linkSent: false,
    },
  });
  const stillReserved = await prisma.center.findFirst({
    where: {
      id: center.id,
      customFields: { equals: reservedFields as Prisma.InputJsonValue },
    },
    select: { id: true },
  });
  if (!stillReserved) {
    return NextResponse.json({ ok: false, error: "The school's Stripe migration changed after setup was reserved. Refresh and try again." }, { status: 409 });
  }
  const link = await createStripeAccountLink({
    accountId: migration.targetAccountId,
    refreshUrl,
    returnUrl,
    collectionFields: corporateVerification ? "currently_due" : "eventually_due",
    includeFutureRequirements: !corporateVerification,
    tenantId: user.tenantId,
  });
  if (!link.ok || !link.url) {
    const providerRejectedLink = Boolean(link.providerStatus && link.providerStatus >= 400 && link.providerStatus < 500);
    if (providerRejectedLink) {
      const failedAt = new Date().toISOString();
      const restoredStatus = migration.status === "onboarding_opened"
        ? migration.targetRequirementFields.length ? "requirements_due" : "prepared"
        : migration.status;
      const releasedFields: Prisma.JsonObject = {
        ...fields,
        stripeConnectMigrationStatus: restoredStatus,
        stripeConnectMigrationLastOnboardingAt: null,
        stripeConnectMigrationLastOnboardingFailureAt: failedAt,
        stripeConnectMigrationLastOnboardingFailureCode: `provider_${link.providerStatus}`,
        stripeConnectMigrationLinksSent: false,
      };
      const released = await prisma.center.updateMany({
        where: {
          id: center.id,
          customFields: { equals: reservedFields as Prisma.InputJsonValue },
        },
        data: { customFields: releasedFields },
      });
      if (released.count === 1) {
        await writeAuditLog(user, {
          centerId: center.id,
          action: "billing.connect.migration.onboarding_reservation_released",
          resource: "Center",
          resourceId: center.id,
          metadata: {
            sourceAccountId: migration.sourceAccountId,
            targetAccountId: migration.targetAccountId,
            providerStatus: link.providerStatus,
            linkStored: false,
            linkSent: false,
          },
        });
      }
    }
    return NextResponse.json({ ok: false, error: link.error || "The secure reauthorization link could not be opened." }, { status: link.configured ? 502 : 503 });
  }
  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.connect.migration.onboarding_opened",
    resource: "Center",
    resourceId: center.id,
    metadata: {
      sourceAccountId: migration.sourceAccountId,
      targetAccountId: migration.targetAccountId,
      authorizedRepresentativeConfirmed: true,
      termsAccepted: true,
      corporateVerification,
      returnToCorporatePortfolio,
      linkStored: false,
      linkSent: false,
    },
  });
  return NextResponse.json({ ok: true, url: link.url, centerId: center.id });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
