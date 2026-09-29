import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readBlockedMessageSenderIds, setMessageSenderBlock } from "@/lib/message-block-store";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { hasTrustedMutationOrigin } from "@/lib/request-origin";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const ids = await readBlockedMessageSenderIds(prisma, user.id);
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids }, tenantId: user.tenantId }, select: { id: true, name: true } }) : [];
  return NextResponse.json({ ok: true, senders: ids.map(id => ({ id, name: users.find(sender => sender.id === id)?.name ?? "Blocked sender" })) }, { headers: { "Cache-Control": "private, no-store" } });
}
async function PATCHHandler(request: NextRequest) {
  if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ ok: false, error: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const limit = await checkPersistentRateLimit({ key: `message-unblock:${user.id}:${requestIp(request.headers)}`, limit: 30, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many changes. Try again later." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limit.resetAt)) } });
  const body = await request.json().catch(() => null);
  const senderId = typeof body?.senderId === "string" ? body.senderId : "";
  if (!(await readBlockedMessageSenderIds(prisma, user.id)).includes(senderId)) return NextResponse.json({ ok: false, error: "Blocked sender not found." }, { status: 404 });
  await prisma.$transaction(tx => setMessageSenderBlock(tx, { userId: user.id, identityTenantId: user.identityTenantId, tenantId: user.tenantId, senderId, centerId: null, blocked: false }));
  return NextResponse.json({ ok: true });
}
export const GET = withApiLogging("GET", GETHandler, { omitRequestBody: true, omitResponseBody: true });
export const PATCH = withApiLogging("PATCH", PATCHHandler, { omitRequestBody: true, omitResponseBody: true });
