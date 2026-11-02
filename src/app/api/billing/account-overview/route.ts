import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canManageBilling, getCurrentUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/rbac";
import { readAuthorizedFamilyPaymentTarget } from "@/lib/family-payment-preflight";
import { readFamilyPaymentSnapshot } from "@/lib/family-payment-snapshot";
import { directorPaymentProgress } from "@/lib/director-payment-progress";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

async function handleGet(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canManageBilling(user) || !canAccessModule(user, "billing-invoices")) return NextResponse.json({ error: "Billing access required" }, { status: 403 });
  const familyId = request.nextUrl.searchParams.get("familyId");
  const centerId = request.nextUrl.searchParams.get("centerId");
  const billingAccountId = request.nextUrl.searchParams.get("billingAccountId");
  if (!familyId || !centerId || !billingAccountId) return NextResponse.json({ error: "Choose a school and family account" }, { status: 400 });
  // Read the same calculation used by checkout, with exact authorization in one snapshot.
  const overview = await prisma.$transaction(async tx => {
    const target = await readAuthorizedFamilyPaymentTarget(tx, user, { familyId, billingAccountId });
    if (!target || target.centerId !== centerId) return null;
    const snapshot = await readFamilyPaymentSnapshot(tx, target);
    if (!snapshot) return null;
    const pending = directorPaymentProgress(snapshot.draftStripePayments);
    return {
      familyId: target.familyId, centerId: target.centerId, billingAccountId: target.billingAccountId,
      postedBalanceCents: snapshot.billingAccount.balanceCents,
      collectibleCents: snapshot.collectableCents,
      responsibilityReviewRequired: snapshot.responsibilityReviewRequired,
      pendingCount: pending?.count ?? 0,
      provisionalAchCreditCents: pending?.provisionalAchCreditCents ?? 0,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!overview) return NextResponse.json({ error: "This account is unavailable in your billing workspace" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiLogging("GET", handleGet, { omitRequestBody: true, omitResponseBody: true });
