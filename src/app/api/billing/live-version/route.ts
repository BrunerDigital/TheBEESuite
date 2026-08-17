import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/rbac";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canAccessModule(user, "billing-invoices") && !canAccessModule(user, "payments")) {
    return NextResponse.json({ ok: false, error: "Billing access required." }, { status: 403 });
  }

  const paymentWhere = {
    billingAccount: { family: { centerId: { in: user.centerIds } } },
  };
  const [recentPayments, paymentStatusCounts, latestLedgerEntry] = user.centerIds.length
    ? await Promise.all([
      prisma.payment.findMany({
        where: {
          ...paymentWhere,
        },
        orderBy: { id: "desc" },
        take: 100,
        select: { id: true, status: true, paidAt: true, customFields: true },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        where: paymentWhere,
        _count: { _all: true },
        orderBy: { status: "asc" },
      }),
      prisma.ledgerEntry.findFirst({
        where: { billingAccount: paymentWhere.billingAccount },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true },
      }),
    ])
    : [[], [], null] as const;
  const paymentVersions = recentPayments.map((payment) => {
    const fields = payment.customFields && typeof payment.customFields === "object" && !Array.isArray(payment.customFields)
      ? payment.customFields as Record<string, unknown>
      : {};
    return {
      id: payment.id,
      status: payment.status,
      paidAt: payment.paidAt,
      refundedCents: Number(fields.stripeAmountRefundedCents) || 0,
    };
  });
  const version = createHash("sha256")
    .update(JSON.stringify({ paymentVersions, paymentStatusCounts, latestLedgerEntry }))
    .digest("base64url");

  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("GET", GETHandler);
