import { NextRequest, NextResponse } from "next/server";
import { withApiLogging } from "@/lib/request-response-logging";
import { dispatchPendingWebPush } from "@/lib/web-push";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const result = await dispatchPendingWebPush({ limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}

export const GET = withApiLogging("GET", GETHandler);
