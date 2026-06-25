import { NextRequest, NextResponse } from "next/server";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  canAccessTerminalStore,
  createTerminalStoreCheckoutSession,
  terminalStoreOrderTotals,
  type TerminalStoreLineItem,
} from "@/lib/terminal-store";
import { getAppBaseUrl } from "@/lib/supabase-auth";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requestBaseUrl(request: NextRequest) {
  return getAppBaseUrl(request.url);
}

function lineItemsFromBody(value: unknown): TerminalStoreLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return {
      itemId: clean(record.itemId),
      quantity: Number(record.quantity) || 0,
    };
  });
}

async function resolveValidatedCenterId(user: Awaited<ReturnType<typeof getCurrentUser>>, requestedCenterId: string) {
  if (!user) return null;
  const fallbackCenterId = user.primaryCenterId ?? user.centerIds[0] ?? "";
  const centerId = requestedCenterId || fallbackCenterId;
  if (!centerId) return null;

  const center = await prisma.center.findFirst({
    where: canAccessAllCenters(user)
      ? { id: centerId, organization: { tenantId: user.tenantId } }
      : {
          AND: [
            { id: centerId },
            { id: { in: user.centerIds.length ? user.centerIds : ["__none__"] } },
            { organization: { tenantId: user.tenantId } },
          ],
        },
    select: { id: true, name: true },
  });
  return center?.id ?? null;
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canAccessTerminalStore(user)) {
    return NextResponse.json({ ok: false, error: "Terminal store access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const items = lineItemsFromBody(body.items);
  const totals = terminalStoreOrderTotals(items);
  if (!totals.items.length) {
    return NextResponse.json({ ok: false, error: "Select at least one item before checkout." }, { status: 400 });
  }

  const requestedCenterId = clean(body.centerId);
  const centerId = await resolveValidatedCenterId(user, requestedCenterId);
  if (requestedCenterId && !centerId) {
    return NextResponse.json({ ok: false, error: "The selected school is not available for your account." }, { status: 403 });
  }
  const baseUrl = requestBaseUrl(request);
  const orderReference = `terminal-store-${Date.now()}-${user.id.slice(0, 8)}`;
  const checkout = await createTerminalStoreCheckoutSession({
    items,
    purchaserEmail: user.email,
    purchaserName: user.name,
    successUrl: `${baseUrl}/terminal-store?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/terminal-store?purchase=cancelled`,
    metadata: {
      orderReference,
      tenantId: user.tenantId,
      centerId: centerId || "",
      purchaserUserId: user.id,
      purchaserRole: user.role,
      platformPayoutAccount: "thebeesuite.io",
    },
    idempotencyKey: orderReference,
  });

  if (!checkout.ok || !checkout.url) {
    return NextResponse.json(
      { ok: false, configured: checkout.configured, error: checkout.error || "Terminal store checkout could not be created." },
      { status: checkout.configured ? 502 : 503 },
    );
  }

  await writeAuditLog(user, {
    centerId,
    action: "terminal_store.checkout.created",
    resource: "StripeCheckoutSession",
    resourceId: checkout.id || null,
    metadata: {
      orderReference,
      stripeCheckoutSessionId: checkout.id || null,
      checkoutTotalCents: checkout.totalCents ?? totals.subtotalCents,
      stripeBaseSubtotalCents: checkout.stripeBaseSubtotalCents ?? totals.stripeBaseSubtotalCents,
      beeSuiteMarkupCents: checkout.markupCents ?? totals.markupCents,
      items: totals.items.map((row) => ({
        itemId: row.item.id,
        name: row.item.name,
        quantity: row.quantity,
        stripeBasePriceCents: row.item.stripeBasePriceCents,
        priceCents: row.item.priceCents,
      })),
      platformPayoutAccount: "thebeesuite.io",
    },
  });

  return NextResponse.json({
    ok: true,
    url: checkout.url,
    stripeSessionId: checkout.id,
    totalCents: checkout.totalCents ?? totals.subtotalCents,
  });
}

export const POST = withApiLogging("POST", POSTHandler);
