import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { withApiLogging } from "@/lib/request-response-logging";
import {
  getWebPushConfiguration,
  webPushEndpointHash,
  webPushUserAgentHash,
} from "@/lib/web-push";
import { safeWebPushPlatform } from "@/lib/web-push-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

type SubscriptionPayload = {
  endpoint?: unknown;
  expirationTime?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function sameOrigin(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function bodySizeAllowed(request: NextRequest) {
  const value = request.headers.get("content-length");
  if (!value) return true;
  const length = Number(value);
  return Number.isFinite(length) && length >= 0 && length <= MAX_BODY_BYTES;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validKey(value: unknown, minimum: number, maximum: number) {
  const key = clean(value);
  return key.length >= minimum && key.length <= maximum && /^[A-Za-z0-9_-]+$/.test(key) ? key : "";
}

function parseEndpoint(value: unknown) {
  const endpoint = clean(value);
  if (!endpoint || endpoint.length > 4096) return "";
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" ? endpoint : "";
  } catch {
    return "";
  }
}

function parseExpirationTime(value: unknown) {
  if (value === null || value === undefined) return null;
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now() || timestamp > Date.UTC(3000, 0, 1)) return undefined;
  return new Date(timestamp);
}

async function rateLimitUser(userId: string) {
  return checkPersistentRateLimit({
    key: `web-push-subscription:${userId}`,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const configuration = getWebPushConfiguration();
  const activeSubscriptions = await prisma.webPushSubscription.count({
    where: {
      tenantId: user.tenantId,
      userId: user.id,
      isActive: true,
      ...(user.deviceSessionId ? { deviceSessionId: user.deviceSessionId } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    configured: configuration.configured,
    publicKey: configuration.publicKey,
    activeSubscriptions,
  });
}

async function POSTHandler(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Same-origin request required." }, { status: 403 });
  }
  if (!bodySizeAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Subscription payload is too large." }, { status: 413 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  const rateLimit = await rateLimitUser(user.id);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many notification subscription changes. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)) } },
    );
  }

  const configuration = getWebPushConfiguration();
  if (!configuration.configured) {
    return NextResponse.json({ ok: false, error: "Web Push is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as {
    subscription?: SubscriptionPayload;
    platform?: unknown;
  } | null;
  const subscription = body?.subscription;
  const endpoint = parseEndpoint(subscription?.endpoint);
  const p256dh = validKey(subscription?.keys?.p256dh, 60, 256);
  const auth = validKey(subscription?.keys?.auth, 10, 128);
  const expiresAt = parseExpirationTime(subscription?.expirationTime);
  if (!endpoint || !p256dh || !auth || expiresAt === undefined) {
    return NextResponse.json({ ok: false, error: "A valid browser push subscription is required." }, { status: 400 });
  }

  const endpointHash = webPushEndpointHash(endpoint);
  const existing = await prisma.webPushSubscription.findUnique({
    where: { endpointHash },
    select: { id: true, tenantId: true, userId: true, deviceSessionId: true, isActive: true },
  });
  const ownershipChanged = Boolean(existing && (existing.tenantId !== user.tenantId || existing.userId !== user.id));
  const subscriptionStateChanged = Boolean(
    !existing ||
    ownershipChanged ||
    !existing.isActive ||
    existing.deviceSessionId !== user.deviceSessionId
  );
  const now = new Date();

  const stored = await prisma.$transaction(async (transaction) => {
    if (existing && ownershipChanged) {
      await transaction.webPushDelivery.updateMany({
        where: {
          subscriptionId: existing.id,
          status: { in: ["pending", "processing", "retry"] },
        },
        data: {
          status: "cancelled",
          failedAt: now,
          errorCode: "subscription_rebound",
        },
      });
    }

    return transaction.webPushSubscription.upsert({
      where: { endpointHash },
      update: {
        tenantId: user.tenantId,
        userId: user.id,
        deviceSessionId: user.deviceSessionId,
        endpoint,
        p256dh,
        auth,
        expiresAt,
        userAgentHash: webPushUserAgentHash(request.headers.get("user-agent") || ""),
        platform: safeWebPushPlatform(body?.platform),
        isActive: true,
        lastSeenAt: now,
        failureCount: 0,
      },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        deviceSessionId: user.deviceSessionId,
        endpointHash,
        endpoint,
        p256dh,
        auth,
        expiresAt,
        userAgentHash: webPushUserAgentHash(request.headers.get("user-agent") || ""),
        platform: safeWebPushPlatform(body?.platform),
        lastSeenAt: now,
      },
      select: { id: true, platform: true, isActive: true },
    });
  });

  if (subscriptionStateChanged) {
    await writeAuditLog(user, {
      centerId: user.primaryCenterId,
      action: ownershipChanged ? "web_push.subscription.rebound" : "web_push.subscription.enabled",
      resource: "WebPushSubscription",
      resourceId: stored.id,
      metadata: {
        platform: stored.platform,
        active: stored.isActive,
        deviceSessionBound: Boolean(user.deviceSessionId),
      },
    });
  }

  return NextResponse.json({ ok: true, enabled: true });
}

async function DELETEHandler(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Same-origin request required." }, { status: 403 });
  }
  if (!bodySizeAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Subscription payload is too large." }, { status: 413 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  const rateLimit = await rateLimitUser(user.id);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many notification subscription changes. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)) } },
    );
  }

  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const endpoint = parseEndpoint(body?.endpoint);
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "A valid subscription endpoint is required." }, { status: 400 });
  }

  const stored = await prisma.webPushSubscription.findFirst({
    where: {
      endpointHash: webPushEndpointHash(endpoint),
      tenantId: user.tenantId,
      userId: user.id,
    },
    select: { id: true },
  });
  if (!stored) return NextResponse.json({ ok: true, enabled: false });

  const now = new Date();
  await prisma.$transaction([
    prisma.webPushSubscription.update({
      where: { id: stored.id },
      data: { isActive: false, lastSeenAt: now },
    }),
    prisma.webPushDelivery.updateMany({
      where: {
        subscriptionId: stored.id,
        status: { in: ["pending", "processing", "retry"] },
      },
      data: {
        status: "cancelled",
        failedAt: now,
        errorCode: "user_unsubscribed",
      },
    }),
  ]);

  await writeAuditLog(user, {
    centerId: user.primaryCenterId,
    action: "web_push.subscription.disabled",
    resource: "WebPushSubscription",
    resourceId: stored.id,
  });

  return NextResponse.json({ ok: true, enabled: false });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
export const DELETE = withApiLogging("DELETE", DELETEHandler);
