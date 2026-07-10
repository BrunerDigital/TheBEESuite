import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  clientErrorFingerprintParts,
  normalizeClientErrorReportPayload,
} from "@/lib/client-error-reporting";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

function sha256Short(value: string, length = 32) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function releaseVersion() {
  return (
    process.env.RELEASE_VERSION ||
    process.env.NEXT_PUBLIC_RELEASE_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null
  );
}

function environmentName() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "production";
}

function originAllowed(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function bodySizeAllowed(request: NextRequest) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return true;
  const length = Number(rawLength);
  return Number.isFinite(length) && length >= 0 && length <= MAX_BODY_BYTES;
}

async function parseReportPayload(request: NextRequest) {
  if (!bodySizeAllowed(request)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 }) };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Invalid report payload." }, { status: 400 }) };
  }

  return { ok: true as const, report: normalizeClientErrorReportPayload(body) };
}

async function POSTHandler(request: NextRequest) {
  if (process.env.CLIENT_ERROR_REPORTING === "off") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  if (!originAllowed(request)) {
    return NextResponse.json({ ok: false, error: "Same-origin request required." }, { status: 403 });
  }

  const ipAddress = requestIp(request.headers);
  const userAgent = request.headers.get("user-agent") || "";
  const rateLimit = await checkPersistentRateLimit({
    key: `client-error-report:${ipAddress}:${sha256Short(userAgent, 16)}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many reports. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rateLimit.resetAt)) } },
    );
  }

  const parsed = await parseReportPayload(request);
  if (!parsed.ok) return parsed.response;

  const user = await getCurrentUser({ allowPasswordResetRequired: true }).catch(() => null);
  const release = releaseVersion();
  const environment = environmentName();
  const fingerprint = sha256Short(clientErrorFingerprintParts(parsed.report).join("\n"), 32);
  const dedupeKey = sha256Short([environment, release || "no-release", fingerprint].join(":"), 40);
  const now = new Date();

  try {
    const stored = await prisma.clientErrorReport.upsert({
      where: { dedupeKey },
      update: {
        source: parsed.report.source,
        errorType: parsed.report.errorType,
        severity: parsed.report.severity,
        message: parsed.report.message,
        stackSample: parsed.report.stackSample,
        componentStack: parsed.report.componentStack,
        path: parsed.report.path,
        tenantId: user?.tenantId ?? null,
        centerId: user?.primaryCenterId ?? null,
        userId: user?.id ?? null,
        userAgentHash: sha256Short(userAgent, 16),
        ipHash: sha256Short(ipAddress, 16),
        metadata: parsed.report.metadata ?? undefined,
        occurrenceCount: { increment: 1 },
        lastSeenAt: now,
      },
      create: {
        dedupeKey,
        fingerprint,
        environment,
        release,
        source: parsed.report.source,
        errorType: parsed.report.errorType,
        severity: parsed.report.severity,
        message: parsed.report.message,
        stackSample: parsed.report.stackSample,
        componentStack: parsed.report.componentStack,
        path: parsed.report.path,
        tenantId: user?.tenantId ?? null,
        centerId: user?.primaryCenterId ?? null,
        userId: user?.id ?? null,
        userAgentHash: sha256Short(userAgent, 16),
        ipHash: sha256Short(ipAddress, 16),
        metadata: parsed.report.metadata ?? undefined,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      select: { id: true, occurrenceCount: true },
    });

    return NextResponse.json({ ok: true, id: stored.id, occurrenceCount: stored.occurrenceCount });
  } catch (error) {
    logOperationalError("client_error_report.store_failed", error, {
      source: parsed.report.source,
      path: parsed.report.path,
      environment,
    });
    return NextResponse.json({ ok: true, stored: false });
  }
}

export const POST = withApiLogging("POST", POSTHandler);
