import { NextRequest, NextResponse } from "next/server";
import { canManageBilling, getCurrentUser } from "@/lib/auth";
import { accountBalanceCenterIds } from "@/lib/accounts-receivable";
import { visibleCurrentFamilyWhere } from "@/lib/corporate-view-scope";
import { isAchPaymentProcessing } from "@/lib/ach-payment-lifecycle";
import { appReviewReservedIdentityKind } from "@/lib/app-review-targeting";
import { buildPaymentMethodRequestEmailSubject, buildPaymentMethodRequestEmailText, paymentMethodRequestRecipientOptions } from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user)) return NextResponse.json({ error: "Billing access is required." }, { status: 403 });
  const familyId = request.nextUrl.searchParams.get("familyId")?.trim();
  if (!familyId) return NextResponse.json({ error: "Choose a family." }, { status: 400 });
  const centers = await prisma.center.findMany({
    where: { id: { in: accountBalanceCenterIds(user) }, status: { not: "closed" }, ...(user.role === "PLATFORM_OWNER" ? {} : { organization: { tenantId: user.tenantId } }) },
    select: { id: true, name: true, crmLocationId: true },
  });
  const family = await prisma.family.findFirst({
    where: { id: familyId, ...visibleCurrentFamilyWhere(centers.map((center) => center.id)) },
    select: {
      name: true, centerId: true, billingEmail: true,
      guardians: { select: { id: true, fullName: true, email: true, userId: true } },
      billingAccount: { select: { balanceCents: true, payments: { where: { status: "DRAFT", provider: "stripe" }, select: { amountCents: true, status: true, provider: true, customFields: true } } } },
    },
  });
  if (!family) return NextResponse.json({ error: "Current family not found in your school scope." }, { status: 404 });
  if (!family.billingAccount || family.billingAccount.balanceCents <= 0) return NextResponse.json({ error: "This family no longer has an outstanding balance. Refresh balances." }, { status: 409 });
  if (family.billingAccount.payments.some(isAchPaymentProcessing)) return NextResponse.json({ error: "A bank payment is processing. Review it before sending another payment request." }, { status: 409 });
  const recipients = paymentMethodRequestRecipientOptions(family);
  if (recipients.some((recipient) => appReviewReservedIdentityKind(recipient.email))) return NextResponse.json({ error: "Payment reminders are disabled for App Review demo accounts." }, { status: 409 });
  const center = centers.find((item) => item.id === family.centerId);
  const centerLabel = center?.crmLocationId ?? center?.name ?? "School";
  return NextResponse.json({
    familyName: family.name, balanceCents: family.billingAccount.balanceCents,
    subject: buildPaymentMethodRequestEmailSubject({ centerLabel, intent: "payment_steps" }),
    recipients: recipients.map((recipient) => ({ email: recipient.email, label: recipient.label, text: buildPaymentMethodRequestEmailText({ recipientLabel: recipient.label, familyName: family.name, centerLabel, formUrl: "[secure payment link created when you send]", intent: "payment_steps" }) })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiLogging("GET", GETHandler);
