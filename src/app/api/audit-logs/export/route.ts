import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAccessModule } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { AuditHistoryError, parseAuditHistoryFilters } from "@/lib/audit-history";
import { readAuditHistoryCsv } from "@/lib/audit-history-query";
import { withApiLogging } from "@/lib/request-response-logging";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to export audit history." }, { status: 401, headers: privateHeaders });
  if (!canAccessModule(user, "audit-logs") || !user.workspace || !["center", "all", "fixed"].includes(user.workspace.mode)) {
    return NextResponse.json({ ok: false, error: "Select an authorized workspace to export audit history." }, { status: 403, headers: privateHeaders });
  }
  try {
    const filters = parseAuditHistoryFilters(request.nextUrl.searchParams);
    const userRate = await checkPersistentRateLimit({ key: `audit-export:user:${user.identityTenantId}:${user.id}`, limit: 4, windowMs: 60_000 });
    if (!userRate.ok) return NextResponse.json({ ok: false, error: "Please wait before exporting again." }, { status: 429, headers: { ...privateHeaders, "Retry-After": String(retryAfterSeconds(userRate.resetAt)) } });
    const ipRate = await checkPersistentRateLimit({ key: `audit-export:ip:${requestIp(request.headers)}`, limit: 20, windowMs: 60_000 });
    if (!ipRate.ok) return NextResponse.json({ ok: false, error: "Please wait before exporting again." }, { status: 429, headers: { ...privateHeaders, "Retry-After": String(retryAfterSeconds(ipRate.resetAt)) } });
    const result = await prisma.$transaction(tx => readAuditHistoryCsv(tx, user, filters), { isolationLevel: "RepeatableRead", timeout: 20_000 });
    return new NextResponse(result.csv, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bee-suite-audit-history-${filters.asOf.slice(0, 10)}.csv"`,
      "Content-Length": String(result.bytes), "X-Audit-Row-Count": String(result.rows) } });
  } catch (error) {
    if (error instanceof AuditHistoryError) return NextResponse.json({ ok: false, error: error.message }, { status: error.statusCode, headers: privateHeaders });
    return NextResponse.json({ ok: false, error: "The export could not be completed. Narrow the filters or try again." }, { status: 503, headers: privateHeaders });
  }
}
export const GET = withApiLogging("GET", GETHandler, { omitRequestBody: true, omitResponseBody: true });
