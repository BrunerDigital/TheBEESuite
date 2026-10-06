import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredImportStaging } from "@/lib/procare-staging-cleanup";
import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const maxDuration = 300;
async function GETHandler(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  const result = await cleanupExpiredImportStaging(request.nextUrl.searchParams.get("dryRun") === "1");
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
export const GET = withApiLogging("GET", GETHandler);
