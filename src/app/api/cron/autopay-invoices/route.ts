import { NextRequest, NextResponse } from "next/server";
import { processAutopayInvoices } from "@/lib/autopay-processing";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function parseDate(value: string | null) {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), 100);
}

async function GETHandler(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const centerId = request.nextUrl.searchParams.get("centerId");
  const result = await processAutopayInvoices({
    dryRun: request.nextUrl.searchParams.get("dryRun") === "1",
    asOf: parseDate(request.nextUrl.searchParams.get("asOf")),
    limit: parseLimit(request.nextUrl.searchParams.get("limit")),
    centerIds: centerId ? [centerId] : undefined,
    invoiceId: request.nextUrl.searchParams.get("invoiceId"),
    retryFailed: request.nextUrl.searchParams.get("retryFailed") === "1",
  });

  return NextResponse.json(result);
}

export const GET = withApiLogging("GET", GETHandler);
