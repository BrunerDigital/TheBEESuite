import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { processAutopayInvoices } from "@/lib/autopay-processing";
import { prisma } from "@/lib/prisma";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseDate(value: unknown) {
  const text = clean(value);
  if (!text) return new Date();
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseLimit(value: unknown) {
  const parsed = Number.parseInt(clean(value), 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.min(Math.max(parsed, 1), 100);
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Autopay processing is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const centerId = clean(body.centerId);
  const invoiceId = clean(body.invoiceId);
  const chargeMode = body.dryRun === false || clean(body.mode).toLowerCase() === "charge";
  let centerIds: string[] | undefined;

  if (centerId) {
    if (!canAccessCenter(user, centerId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 });
    }
    centerIds = [centerId];
  } else if (user.role !== UserRole.PLATFORM_OWNER) {
    centerIds = user.centerIds.length ? user.centerIds : ["__no_authorized_center__"];
  }

  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        billingAccount: {
          select: {
            family: { select: { centerId: true } },
          },
        },
      },
    });
    const invoiceCenterId = invoice?.billingAccount.family.centerId || null;
    if (!invoiceCenterId) {
      return NextResponse.json({ ok: false, error: "Invoice is not linked to a school." }, { status: 404 });
    }
    if (!canAccessCenter(user, invoiceCenterId)) {
      return NextResponse.json({ ok: false, error: "You do not have access to this invoice." }, { status: 403 });
    }
    centerIds = [invoiceCenterId];
  }

  const result = await processAutopayInvoices({
    dryRun: !chargeMode,
    asOf: parseDate(body.asOf),
    limit: parseLimit(body.limit),
    centerIds,
    invoiceId,
    retryFailed: body.retryFailed === true,
    requestedByUserId: user.id,
  });

  return NextResponse.json(result);
}

export const POST = withApiLogging("POST", POSTHandler);
