import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getKidCitySoftwareInvoiceSnapshot } from "@/lib/kidcity-software-billing";
import { prisma } from "@/lib/prisma";
import { canAccessModule } from "@/lib/rbac";
import { canUseKidCityCorporateBilling } from "@/lib/brand-assets";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canAccessModule(user, "corporate-billing")) {
    return NextResponse.json({ ok: false, error: "Corporate billing access is not allowed for this role." }, { status: 403 });
  }
  if (!canUseKidCityCorporateBilling(user.role, user.branding.kind)) {
    return NextResponse.json({ ok: false, error: "This invoice is only available to the Kid City USA tenant." }, { status: 403 });
  }

  const snapshot = await getKidCitySoftwareInvoiceSnapshot(prisma);
  return NextResponse.json({ ok: true, invoice: snapshot });
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canAccessModule(user, "corporate-billing")) {
    return NextResponse.json({ ok: false, error: "Corporate billing access is not allowed for this role." }, { status: 403 });
  }
  if (!canUseKidCityCorporateBilling(user.role, user.branding.kind)) {
    return NextResponse.json({ ok: false, error: "This invoice is only available to the Kid City USA tenant." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const sendInvoice = body.sendInvoice === true;
  const snapshot = await getKidCitySoftwareInvoiceSnapshot(prisma);

  if (!sendInvoice) {
    return NextResponse.json({ ok: true, mode: "preview", invoice: snapshot });
  }
  return NextResponse.json({
    ok: false,
    error: "Aggregate emailed software invoices are disabled. Each school is billed $99 through its separately authorized school subscription.",
    invoice: snapshot,
  }, { status: 409 });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
