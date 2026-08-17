import { NextResponse } from "next/server";
import { canManageBilling, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access required." }, { status: 403 });
  }

  const latestPaymentEntry = user.centerIds.length
    ? await prisma.ledgerEntry.findFirst({
        where: {
          paymentId: { not: null },
          billingAccount: { family: { centerId: { in: user.centerIds } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true },
      })
    : null;
  const version = latestPaymentEntry
    ? `${latestPaymentEntry.createdAt.toISOString()}:${latestPaymentEntry.id}`
    : "none";

  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("GET", GETHandler);
