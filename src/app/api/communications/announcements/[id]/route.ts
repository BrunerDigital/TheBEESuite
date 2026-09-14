import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canManageOperations } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AnnouncementWorkflowError, loadAnnouncementForActor } from "@/lib/announcement-persistence";
import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function GETHandler(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers });
  if (!canManageOperations(actor)) return NextResponse.json({ ok: false, error: "Announcement editing is not allowed for this role." }, { status: 403, headers });
  const { id } = await context.params;
  if (!id || id.length > 120) return NextResponse.json({ ok: false, error: "Invalid announcement reference." }, { status: 400, headers });
  try {
    const record = await loadAnnouncementForActor(prisma, actor, id);
    return NextResponse.json({ ok: true, record }, { headers });
  } catch (error) {
    if (error instanceof AnnouncementWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers });
    throw error;
  }
}
export const GET = withApiLogging("GET", GETHandler);
