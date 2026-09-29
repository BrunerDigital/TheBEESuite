import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { setMessageSenderBlock, visibleReceivedMessage } from "@/lib/message-block-store";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
async function POSTHandler(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const limit = await checkPersistentRateLimit({ key: `message-block:${user.id}:${requestIp(request.headers)}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many changes. Try again later." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.resetAt)) } });
  const { id } = await context.params;
  const target = await visibleReceivedMessage(prisma, { ...user, canAccessEveryCenter: canAccessAllCenters(user) }, id);
  if (!target) return NextResponse.json({ ok: false, error: "Message is not available in your access scope." }, { status: 404 });
  await prisma.$transaction(tx => setMessageSenderBlock(tx, { ...target, userId: user.id, identityTenantId: user.identityTenantId, tenantId: user.tenantId, blocked: true }));
  return NextResponse.json({ ok: true });
}
export const POST = withApiLogging("POST", POSTHandler, { omitRequestBody: true, omitResponseBody: true });
