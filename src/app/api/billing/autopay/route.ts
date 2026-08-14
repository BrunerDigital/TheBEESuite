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

function reviewedInvoices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const fields = jsonObject(entry);
    const invoiceId = clean(fields.invoiceId);
    const amountCents = Number(fields.amountCents);
    return invoiceId && Number.isInteger(amountCents) && amountCents >= 0
      ? [{ invoiceId, amountCents }]
      : [];
  });
}

function summarize(results: Awaited<ReturnType<typeof processAutopayInvoices>>["results"], asOf: string) {
  const count = (status: (typeof results)[number]["status"]) => results.filter((result) => result.status === status).length;
  return {
    ok: true as const,
    dryRun: false,
    asOf,
    scanned: results.length,
    eligible: count("paid") + count("processing") + count("failed"),
    wouldCharge: 0,
    paid: count("paid"),
    processing: count("processing"),
    failed: count("failed"),
    skipped: count("skipped"),
    totalCents: results
      .filter((result) => result.status === "paid" || result.status === "processing")
      .reduce((sum, result) => sum + result.amountCents, 0),
    hasMore: false,
    results,
  };
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
  const processStoredMethod = body.processStoredMethod === true;
  const chargeMode = body.dryRun === false || clean(body.mode).toLowerCase() === "charge";
  const reviewed = reviewedInvoices(body.reviewedInvoices);
  let centerIds: string[] | undefined;

  if (processStoredMethod) {
    return NextResponse.json({ ok: false, error: "A saved payment method can only be run after the parent enables autopay." }, { status: 403 });
  }

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

  const processInput = {
    dryRun: !chargeMode,
    asOf: parseDate(body.asOf),
    limit: parseLimit(body.limit),
    centerIds,
    invoiceId,
    requireDueDate: true,
    collectionMode: "autopay" as const,
    retryFailed: body.retryFailed === true,
    requestedByUserId: user.id,
  };

  if (chargeMode && !invoiceId) {
    if (!reviewed.length) {
      return NextResponse.json({ ok: false, error: "Review eligible family balances before processing autopay." }, { status: 409 });
    }
    const preview = await processAutopayInvoices({ ...processInput, dryRun: true });
    const current = preview.results
      .filter((result) => result.status === "would_charge")
      .map((result) => ({ invoiceId: result.invoiceId, amountCents: result.amountCents }));
    const expected = [...reviewed].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    const actual = [...current].sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return NextResponse.json({
        ok: false,
        error: "Family balances or autopay eligibility changed after review. Review the current balances again before processing.",
        preview,
      }, { status: 409 });
    }

    const results = [];
    for (const item of expected) {
      const run = await processAutopayInvoices({ ...processInput, dryRun: false, limit: 1, invoiceId: item.invoiceId });
      results.push(...run.results);
    }
    return NextResponse.json(summarize(results, new Date().toISOString()));
  }

  const result = await processAutopayInvoices(processInput);

  if (invoiceId && result.results.length === 0) {
    return NextResponse.json(
      { ...result, ok: false, error: "This invoice is not due and eligible for parent-authorized autopay yet." },
      { status: 409 },
    );
  }

  return NextResponse.json(result);
}

export const POST = withApiLogging("POST", POSTHandler);
