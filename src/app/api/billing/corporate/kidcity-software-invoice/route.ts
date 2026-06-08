import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { createStripeInvoice } from "@/lib/integrations";
import { getKidCitySoftwareInvoiceSnapshot } from "@/lib/kidcity-software-billing";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canManageCorporateBilling(role: UserRole) {
  return role === UserRole.PLATFORM_OWNER || role === UserRole.BRAND_ADMIN;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageCorporateBilling(user.role)) {
    return NextResponse.json({ ok: false, error: "Corporate billing access is not allowed for this role." }, { status: 403 });
  }

  const snapshot = await getKidCitySoftwareInvoiceSnapshot(prisma);
  return NextResponse.json({ ok: true, invoice: snapshot });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageCorporateBilling(user.role)) {
    return NextResponse.json({ ok: false, error: "Corporate billing access is not allowed for this role." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const sendInvoice = body.sendInvoice === true;
  const snapshot = await getKidCitySoftwareInvoiceSnapshot(prisma);

  if (!sendInvoice) {
    return NextResponse.json({ ok: true, mode: "preview", invoice: snapshot });
  }
  if (!snapshot.stripeCustomerId) {
    return NextResponse.json({
      ok: false,
      error: "STRIPE_KIDCITY_ENTERPRISES_CUSTOMER_ID is required before sending the Kid City corporate software invoice.",
      invoice: snapshot,
    }, { status: 400 });
  }
  if (snapshot.totalAmountCents <= 0 || snapshot.activeSchoolUserCount <= 0) {
    return NextResponse.json({ ok: false, error: "No active Kid City school users were found for this invoice.", invoice: snapshot }, { status: 400 });
  }

  const stripeInvoice = await createStripeInvoice({
    customerId: snapshot.stripeCustomerId,
    amountCents: snapshot.totalAmountCents,
    description: snapshot.description,
    invoiceNumber: snapshot.invoiceNumber,
    daysUntilDue: snapshot.daysUntilDue,
    sendInvoice: true,
    metadata: {
      invoiceType: "kidcity_monthly_software_fee",
      tenant: "kid-city-usa",
      period: snapshot.period,
      activeSchoolUserCount: String(snapshot.activeSchoolUserCount),
      unitAmountCents: String(snapshot.unitAmountCents),
      totalAmountCents: String(snapshot.totalAmountCents),
      createdBy: user.email,
    },
  });

  await writeAuditLog(user, {
    action: stripeInvoice.ok ? "billing.kidcity_software_invoice.sent" : "billing.kidcity_software_invoice.failed",
    resource: "StripeInvoice",
    resourceId: stripeInvoice.id || snapshot.invoiceNumber,
    metadata: {
      invoiceNumber: snapshot.invoiceNumber,
      stripeInvoiceId: stripeInvoice.id || null,
      stripeHostedInvoiceUrl: stripeInvoice.hostedInvoiceUrl || stripeInvoice.url || null,
      activeSchoolUserCount: snapshot.activeSchoolUserCount,
      unitAmountCents: snapshot.unitAmountCents,
      totalAmountCents: snapshot.totalAmountCents,
      error: stripeInvoice.ok ? null : stripeInvoice.error || null,
    },
  });

  if (!stripeInvoice.ok) {
    return NextResponse.json({ ok: false, error: stripeInvoice.error || "Stripe invoice could not be created.", invoice: snapshot }, { status: stripeInvoice.configured ? 502 : 400 });
  }

  return NextResponse.json({
    ok: true,
    mode: "sent",
    invoice: snapshot,
    stripe: {
      id: stripeInvoice.id,
      url: stripeInvoice.hostedInvoiceUrl || stripeInvoice.url || null,
      invoicePdf: stripeInvoice.invoicePdf || null,
    },
  });
}
