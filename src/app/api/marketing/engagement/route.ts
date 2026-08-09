import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getMarketingConnection } from "@/lib/marketing-connection";
import { resolveMarketingCenter } from "@/lib/marketing-center-access";
import {
  fetchGoogleBusinessReviews,
  fetchMetaInbox,
  replyToGoogleBusinessReview,
} from "@/lib/social-engagement";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

function clean(value: unknown, max = 4_096) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function configString(config: Record<string, string | boolean>, key: string) {
  return typeof config[key] === "string" ? String(config[key]).trim() : "";
}

async function authorizedRequest(centerId: unknown) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }) };
  if (!allowedRoles.has(user.role)) return { response: NextResponse.json({ ok: false, error: "Director access required." }, { status: 403 }) };
  try {
    const center = await resolveMarketingCenter(user, centerId);
    return { user, center };
  } catch (error) {
    return { response: NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Choose an authorized school." }, { status: 403 }) };
  }
}

async function GETHandler(request: NextRequest) {
  const url = new URL(request.url);
  const auth = await authorizedRequest(url.searchParams.get("centerId"));
  if (auth.response) return auth.response;
  const { user, center } = auth;
  const source = url.searchParams.get("source") === "google_reviews" ? "google_reviews" : "meta_inbox";

  try {
    if (source === "meta_inbox") {
      const connection = await getMarketingConnection({
        tenantId: user.tenantId,
        centerId: center.id,
        provider: "meta_social",
        updatedById: user.id,
      });
      if (!connection.integration) return NextResponse.json({ ok: false, configured: false, error: "Connect this school's Facebook Page and Instagram professional profile before loading its inbox." }, { status: 400 });
      const result = await fetchMetaInbox({
        pageId: configString(connection.config, "facebookPageId"),
        token: connection.credentials.META_SOCIAL_ACCESS_TOKEN || process.env.META_SOCIAL_ACCESS_TOKEN || "",
      });
      return NextResponse.json({ ok: true, configured: true, center, source, ...result });
    }

    const connection = await getMarketingConnection({
      tenantId: user.tenantId,
      centerId: center.id,
      provider: "google_business",
      updatedById: user.id,
    });
    if (!connection.integration) return NextResponse.json({ ok: false, configured: false, error: "Connect this school's Google Business Profile before loading reviews." }, { status: 400 });
    const result = await fetchGoogleBusinessReviews({
      accountId: configString(connection.config, "accountId"),
      locationId: configString(connection.config, "locationId"),
      token: connection.credentials.GOOGLE_BUSINESS_ACCESS_TOKEN || process.env.GOOGLE_BUSINESS_ACCESS_TOKEN || "",
    });
    return NextResponse.json({ ok: true, configured: true, center, source, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: error instanceof Error ? error.message.slice(0, 400) : "Provider data could not be loaded." }, { status: 422 });
  }
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const auth = await authorizedRequest(body?.centerId);
  if (auth.response) return auth.response;
  const { user, center } = auth;
  if (body?.action !== "reply_google_review") return NextResponse.json({ ok: false, error: "Unknown engagement action." }, { status: 400 });
  if (body?.confirm !== true) return NextResponse.json({ ok: false, error: "Confirm the public review response before publishing it." }, { status: 400 });

  const connection = await getMarketingConnection({
    tenantId: user.tenantId,
    centerId: center.id,
    provider: "google_business",
    updatedById: user.id,
  });
  if (!connection.integration) return NextResponse.json({ ok: false, error: "Connect this school's Google Business Profile before replying." }, { status: 400 });
  try {
    const reply = await replyToGoogleBusinessReview({
      accountId: configString(connection.config, "accountId"),
      locationId: configString(connection.config, "locationId"),
      reviewName: clean(body?.reviewName, 500),
      comment: clean(body?.comment),
      token: connection.credentials.GOOGLE_BUSINESS_ACCESS_TOKEN || process.env.GOOGLE_BUSINESS_ACCESS_TOKEN || "",
    });
    await writeAuditLog(user, {
      action: "google_business.review.replied",
      resource: "Integration",
      resourceId: connection.integration.id,
      metadata: { centerId: center.id, reviewName: clean(body?.reviewName, 500), replyLength: reply.comment.length },
    });
    return NextResponse.json({ ok: true, center, reply });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message.slice(0, 400) : "The review response could not be published." }, { status: 422 });
  }
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
