import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { getParentPortalFamilyScope, getParentPortalTenantCenterIds } from "@/lib/parent-portal-family-scope";
import { readParentUpdatesContext } from "@/lib/parent-updates-query";
import { parseParentAnnouncementRequest } from "@/lib/parent-announcement-history";
import { readParentAnnouncementRows } from "@/lib/parent-announcement-query";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false, error: "Sign in again to read school announcements." }, 401);
  if (!isParentGuardian(user)) return reply({ ok: false, error: "Parent or guardian access is required." }, 403);
  const input = parseParentAnnouncementRequest(request.nextUrl.searchParams);
  if (!input) return reply({ ok: false, error: "Refresh the school announcements before loading earlier notices." }, 400);
  const scope = await getParentPortalFamilyScope(user.id, user.tenantId, input.familyId);
  if (!scope.ok || scope.familyId !== input.familyId) return reply({ ok: false, error: "These family announcements are not available to your account." }, 403);
  const tenantCenterIds = await getParentPortalTenantCenterIds(user.tenantId);
  const result = await prisma.$transaction(async tx => {
    const context = await readParentUpdatesContext(tx, { familyId: input.familyId, userId: user.id, tenantId: user.tenantId, tenantCenterIds });
    if (!context) return { kind: "unavailable" as const };
    const page = await readParentAnnouncementRows(tx, context, input.cursor, appReviewReservedIdentityKind(user.email) === "parent");
    return page ? { kind: "page" as const, page } : { kind: "cursor" as const };
  }, { isolationLevel: "RepeatableRead" });
  if (result.kind === "unavailable") return reply({ ok: false, error: "Current family access at one confirmed school is required for these announcements." }, 403);
  if (result.kind === "cursor") return reply({ ok: false, error: "This announcement history position is no longer available. Refresh the page." }, 400);
  return reply(result.page);
}
export const GET = withApiLogging("GET", async (request: NextRequest) => {
  try { return await GETHandler(request); }
  catch { return reply({ ok: false, error: "School announcements could not be loaded. Your current view is unchanged. Try again." }, 503); }
}, { omitRequestBody: true, omitResponseBody: true });
