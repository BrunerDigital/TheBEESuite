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

  const tableActivity = user.centerIds.length
    ? await prisma.$queryRaw<Array<{
        relname: string;
        inserted: string;
        updated: string;
        deleted: string;
      }>>`
        SELECT
          relname,
          n_tup_ins::text AS inserted,
          n_tup_upd::text AS updated,
          n_tup_del::text AS deleted
        FROM pg_stat_user_tables
        WHERE schemaname = current_schema()
          AND relname IN ('Payment', 'Invoice', 'LedgerEntry')
        ORDER BY relname
      `
    : [];
  const version = createHash("sha256")
    .update(JSON.stringify(tableActivity))
    .digest("base64url");

  return NextResponse.json(
    { ok: true, version },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("GET", GETHandler);
