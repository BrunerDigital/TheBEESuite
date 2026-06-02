import { NextRequest, NextResponse } from "next/server";
import { retryPendingIntegrationDeliveries } from "@/lib/integration-deliveries";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
  const limit = Number.parseInt(request.nextUrl.searchParams.get("limit") || "25", 10);
  const result = await retryPendingIntegrationDeliveries({
    dryRun,
    limit: Number.isFinite(limit) ? limit : 25,
  });

  return NextResponse.json({
    ok: true,
    dryRun,
    ...result,
  });
}
