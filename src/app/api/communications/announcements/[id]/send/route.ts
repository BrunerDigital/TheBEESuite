import { NextRequest, NextResponse } from "next/server";
import { canManageOperations, getCurrentUser } from "@/lib/auth";
import { AnnouncementWorkflowError } from "@/lib/announcement-persistence";
import { previewAnnouncementEmail, sendAnnouncementEmail } from "@/lib/announcement-email";
import { sendEmail } from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
async function handle(request: NextRequest, context: Context, write: boolean) {
  if (write && !hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403, headers });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers });
  if (!canManageOperations(user)) return NextResponse.json({ ok: false, error: "Announcement email is not allowed for this role." }, { status: 403, headers });
  const { id } = await context.params;
  if (!id || id.length > 120) return NextResponse.json({ ok: false, error: "Invalid announcement reference." }, { status: 400, headers });
  try {
    const result = write
      ? await sendAnnouncementEmail({ database: prisma, actor: user, id, input: await request.json().catch(() => null), send: mail => sendEmail(mail) })
      : { ok: true, preview: await previewAnnouncementEmail(prisma, user, id) };
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof AnnouncementWorkflowError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers });
    throw error;
  }
}
export const GET = withApiLogging("GET", (request: NextRequest, context: Context) => handle(request, context, false));
export const POST = withApiLogging("POST", (request: NextRequest, context: Context) => handle(request, context, true), { omitRequestBody: true });
