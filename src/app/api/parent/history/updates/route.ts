import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { getParentPortalFamilyScope, getParentPortalTenantCenterIds } from "@/lib/parent-portal-family-scope";
import { parseParentUpdatesRequest } from "@/lib/parent-updates-history";
import { parentUpdatesView, readParentUpdatesContext, readParentUpdatesRows } from "@/lib/parent-updates-query";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false, error: "Sign in again to read classroom updates." }, 401);
  if (!isParentGuardian(user)) return reply({ ok: false, error: "Parent or guardian access is required." }, 403);
  const input = parseParentUpdatesRequest(request.nextUrl.searchParams);
  if (!input) return reply({ ok: false, error: "Choose a valid update date and history position." }, 400);
  const scope = await getParentPortalFamilyScope(user.id, user.tenantId, input.familyId);
  if (!scope.ok || scope.familyId !== input.familyId) return reply({ ok: false, error: "These family updates are not available to your account." }, 403);
  const tenantCenterIds = await getParentPortalTenantCenterIds(user.tenantId);
  const result = await prisma.$transaction(async tx => {
    const context = await readParentUpdatesContext(tx, { familyId: input.familyId, userId: user.id, tenantId: user.tenantId, tenantCenterIds });
    if (!context) return { kind: "unavailable" as const };
    const rows = await readParentUpdatesRows(tx, context, input);
    return rows ? { kind: "page" as const, rows } : { kind: "cursor" as const };
  }, { isolationLevel: "RepeatableRead" });
  if (result.kind === "unavailable") return reply({ ok: false, error: "Current family access at one confirmed school is required for these updates." }, 403);
  if (result.kind === "cursor") return reply({ ok: false, error: "This update date or history position is no longer available. Refresh the day." }, 400);
  return reply(await parentUpdatesView(result.rows));
}
export const GET = withApiLogging("GET", async (request: NextRequest) => {
  try { return await GETHandler(request); }
  catch { return reply({ ok: false, error: "Classroom updates could not be loaded. Your current view is unchanged. Try again." }, 503); }
}, { omitRequestBody: true, omitResponseBody: true });
