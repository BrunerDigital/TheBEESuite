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

  const centerActivity = user.centerIds.length
    ? await prisma.center.findMany({
        where: { id: { in: user.centerIds } },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
      })
    : [];
  const version = createHash("sha256")
    .update(JSON.stringify(centerActivity))
    .digest("base64url");

  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("GET", GETHandler);
