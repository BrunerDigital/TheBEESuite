import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser } from "@/lib/auth";
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
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function settingsUrl(baseUrl: string, centerId?: string, status = "refresh_failed") {
  const url = new URL("/billing-settings", baseUrl);
  url.searchParams.set("stripeMigration", status);
  if (centerId) url.searchParams.set("center", centerId);
  return url;
}

function fallbackUrl(baseUrl: string, returnToCorporatePortfolio: boolean, centerId?: string, status = "refresh_failed") {
  if (!returnToCorporatePortfolio) return settingsUrl(baseUrl, centerId, status);
  const url = new URL("/stripe-reauthorization/corporate", baseUrl);
  url.searchParams.set("stripeMigration", status);
  if (centerId) url.searchParams.set("center", centerId);
  return url;
}

function verificationPageUrl(baseUrl: string, centerId: string, status?: string) {
  const url = new URL("/stripe-reauthorization", baseUrl);
  url.searchParams.set("center", centerId);
  url.searchParams.set("portfolio", "corporate");
  if (status) url.searchParams.set("stripeMigration", status);
  return url;
}

async function GETHandler(request: NextRequest) {
  const baseUrl = getSecurePaymentAppBaseUrl(request.url);
  const returnToCorporatePortfolio = request.nextUrl.searchParams.get("portfolio") === "corporate";
  const portfolioQuery = returnToCorporatePortfolio ? "&portfolio=corporate" : "";
  const requestedCenterId = request.nextUrl.searchParams.get("centerId") || "";
  const approvedTarget = requestedCenterId ? readCorporateStripeVerificationTarget(requestedCenterId) : null;
  const user = await getCurrentUser();
  if (!user) {
    const loginUrl = new URL("/directors", baseUrl);
    loginUrl.searchParams.set("next", approvedTarget
      ? `/stripe-reauthorization?center=${encodeURIComponent(requestedCenterId)}&portfolio=corporate&start=1`
      : returnToCorporatePortfolio ? "/stripe-reauthorization/corporate" : "/billing-settings");
    return NextResponse.redirect(loginUrl);
  }
  const centerId = requestedCenterId || user.primaryCenterId;
  if (!centerId) return NextResponse.redirect(fallbackUrl(baseUrl, returnToCorporatePortfolio, undefined, "forbidden"));
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) return NextResponse.redirect(fallbackUrl(baseUrl, returnToCorporatePortfolio, centerId, "not_found"));
  const corporateVerification = Boolean(readCorporateStripeVerificationTarget(center.id));
  if (corporateVerification) {
    const authorization = await authorizeCorporateStripeVerificationCenter({ user, center });
    if (!authorization.ok) return NextResponse.redirect(verificationPageUrl(baseUrl, center.id, authorization.reason));
  } else if ((!canManageBilling(user) && !canManageOperations(user)) || !canAccessCenter(user, center.id)) {
    return NextResponse.redirect(fallbackUrl(baseUrl, returnToCorporatePortfolio, center.id, "forbidden"));
  }
  const migration = readStripeConnectMigration(center.customFields);
  if (!migration.targetAccountId || !migration.sourceAccountId) return NextResponse.redirect(corporateVerification
    ? verificationPageUrl(baseUrl, center.id, "not_prepared")
    : fallbackUrl(baseUrl, returnToCorporatePortfolio, center.id, "not_prepared"));
  if (migration.cutoverAt && !corporateVerification) {
    return NextResponse.redirect(fallbackUrl(baseUrl, returnToCorporatePortfolio, center.id, "not_prepared"));
  }
  const activeAccountId = readStripeConnectedAccountId(center.customFields);
  const bindingValid = corporateVerification
    ? corporateStripeVerificationBindingIsValid({
        activeAccountId,
        sourceAccountId: migration.sourceAccountId,
        targetAccountId: migration.targetAccountId,
        cutoverAt: migration.cutoverAt,
      })
    : activeAccountId === migration.sourceAccountId;
  if (!bindingValid) {
    return NextResponse.redirect(corporateVerification
      ? verificationPageUrl(baseUrl, center.id, "source_changed")
      : fallbackUrl(baseUrl, returnToCorporatePortfolio, center.id, "source_changed"));
  }
  if (corporateVerification) {
    const [target, banks] = await Promise.all([
      retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: user.tenantId }),
    ]);
    if (!target.ok || !target.account || !banks.ok) return NextResponse.redirect(verificationPageUrl(baseUrl, center.id, "refresh_failed"));
    const status = stripeVerificationState(target.account, corporateStripePayoutBankIsConfirmed(banks.banks));
    if (status !== "stripe_verification_required") return NextResponse.redirect(verificationPageUrl(baseUrl, center.id, status));
  }
  const effectivePortfolioQuery = corporateVerification ? "&portfolio=corporate" : portfolioQuery;
  const returnUrl = `${baseUrl}/stripe-reauthorization?stripeMigration=return&center=${encodeURIComponent(center.id)}${effectivePortfolioQuery}`;
  const refreshUrl = `${baseUrl}/api/billing/connect/migration/refresh?centerId=${encodeURIComponent(center.id)}${effectivePortfolioQuery}`;
  const link = await createStripeAccountLink({
    accountId: migration.targetAccountId,
    refreshUrl,
    returnUrl,
    collectionFields: corporateVerification ? "currently_due" : "eventually_due",
    includeFutureRequirements: !corporateVerification,
    tenantId: user.tenantId,
  });
  if (!link.ok || !link.url) return NextResponse.redirect(corporateVerification
    ? verificationPageUrl(baseUrl, center.id, link.configured ? "refresh_failed" : "stripe_missing")
    : fallbackUrl(baseUrl, returnToCorporatePortfolio, center.id, link.configured ? "refresh_failed" : "stripe_missing"));
  return NextResponse.redirect(link.url);
}

export const GET = withApiLogging("GET", GETHandler);
