import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { listStripeBalanceTransactions, listStripePayouts, readStripeConnectedAccountId } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { buildStripePayoutReconciliation } from "@/lib/stripe-payout-reconciliation";

export const runtime = "nodejs";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function dateParam(value: string | null, fallback: Date) {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) return NextResponse.json({ ok: false, error: "Billing reconciliation is not allowed for this role." }, { status: 403 });
  const centerId = request.nextUrl.searchParams.get("centerId") || user.primaryCenterId;
  if (!centerId) return NextResponse.json({ ok: false, error: "Choose a school." }, { status: 400 });
  if (!canAccessCenter(user, centerId)) return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });

  const now = new Date();
  const start = dateParam(request.nextUrl.searchParams.get("start"), new Date(now.getTime() - 7 * 86_400_000));
  const end = dateParam(request.nextUrl.searchParams.get("end"), now);
  if (start >= end || end.getTime() - start.getTime() > 31 * 86_400_000) {
    return NextResponse.json({ ok: false, error: "Choose a reconciliation window of 31 days or less." }, { status: 400 });
  }
  const center = await prisma.center.findUnique({ where: { id: centerId }, select: { id: true, name: true, customFields: true } });
  if (!center) return NextResponse.json({ ok: false, error: "School not found." }, { status: 404 });
  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  if (!connectedAccountId) return NextResponse.json({ ok: false, error: "This school has no connected Stripe account." }, { status: 400 });

  const payments = await prisma.payment.findMany({
    where: {
      provider: "stripe",
      status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
      paidAt: { gte: start, lte: end },
      billingAccount: { family: { is: { centerId } } },
    },
    select: { id: true, amountCents: true, customFields: true },
    orderBy: { paidAt: "asc" },
    take: 500,
  });
  const [balance, payouts] = await Promise.all([
    listStripeBalanceTransactions({ connectedAccountId, createdGte: start, createdLte: end, tenantId: user.tenantId }),
    listStripePayouts({ connectedAccountId, createdGte: start, createdLte: end, tenantId: user.tenantId }),
  ]);
  if (!balance.ok || !payouts.ok) {
    return NextResponse.json({ ok: false, error: balance.error || payouts.error || "Stripe reconciliation data could not be read." }, { status: 502 });
  }
  const report = buildStripePayoutReconciliation({
    localPayments: payments.map((payment) => {
      const fields = jsonObject(payment.customFields);
      return {
        paymentId: payment.id,
        chargeCents: Math.max(0, Number(fields.checkoutTotalCents) || payment.amountCents),
        refundedCents: Math.max(0, Number(fields.stripeAmountRefundedCents) || 0),
        stripeChargeId: typeof fields.stripeChargeId === "string" ? fields.stripeChargeId : null,
      };
    }),
    balanceTransactions: balance.transactions,
    payouts: payouts.payouts,
    balanceHasMore: balance.hasMore,
    payoutsHaveMore: payouts.hasMore,
  });
  return NextResponse.json({
    ok: true,
    readOnly: true,
    center: { id: center.id, name: center.name, connectedAccountId: `${connectedAccountId.slice(0, 8)}...${connectedAccountId.slice(-4)}` },
    window: { start: start.toISOString(), end: end.toISOString() },
    report,
    balanceTransactions: balance.transactions,
    payouts: payouts.payouts,
  });
}

export const GET = withApiLogging("GET", GETHandler);
