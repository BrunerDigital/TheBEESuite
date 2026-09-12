import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { getParentPortalFamilyScope, getParentPortalTenantCenterIds } from "@/lib/parent-portal-family-scope";
import { parentMessageFamilyWhere, parentMessageViews, readParentMessageRows } from "@/lib/parent-message-query";
import { isParentHistoryId, type ParentMessagePage } from "@/lib/parent-message-history";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false, error: "Sign in again to read earlier messages." }, 401);
  if (!isParentGuardian(user)) return reply({ ok: false, error: "Parent or guardian access is required." }, 403);
  const params = request.nextUrl.searchParams;
  const familyId = params.get("familyId"), cursor = params.get("cursor");
  if ([...params.keys()].some(key => !["familyId", "cursor"].includes(key) || params.getAll(key).length !== 1)
    || !isParentHistoryId(familyId) || (cursor !== null && !isParentHistoryId(cursor))) {
    return reply({ ok: false, error: "Refresh this conversation before loading earlier messages." }, 400);
  }
  const scope = await getParentPortalFamilyScope(user.id, user.tenantId, familyId);
  if (!scope.ok || scope.familyId !== familyId) return reply({ ok: false, error: "This family conversation is not available to your account." }, 403);
  const tenantCenterIds = await getParentPortalTenantCenterIds(user.tenantId);
  const familyWhere = parentMessageFamilyWhere({ familyId, userId: user.id, tenantId: user.tenantId, tenantCenterIds });
  const result = await prisma.$transaction(async tx => {
    const family = await tx.family.findFirst({ where: familyWhere, select: { id: true } });
    if (!family) return { kind: "unavailable" as const };
    // Repeat the current-family relation on every cursor/content read, never just a bare family ID.
    const page = await readParentMessageRows(tx.message, { familyId, family: familyWhere }, cursor);
    return page ? { kind: "page" as const, page } : { kind: "cursor" as const };
  }, { isolationLevel: "RepeatableRead" });
  if (result.kind === "unavailable") return reply({ ok: false, error: "Current family access is required for this conversation." }, 403);
  if (result.kind === "cursor") return reply({ ok: false, error: "This history position is no longer available. Refresh the conversation." }, 400);
  return reply({ ok: true, familyId, requestCursor: cursor, items: await parentMessageViews(result.page.items, user.id), nextCursor: result.page.nextCursor } satisfies ParentMessagePage);
}
export const GET = withApiLogging("GET", async (request: NextRequest) => {
  try { return await GETHandler(request); }
  catch { return reply({ ok: false, error: "Earlier messages could not be loaded. Your draft is unchanged. Try again." }, 503); }
}, { omitRequestBody: true, omitResponseBody: true });
