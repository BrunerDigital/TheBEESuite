import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import { notificationExpiresAt } from "@/lib/notification-policy";
import {
  buildPaymentMethodRequestEmailText,
  buildPaymentMethodRequestFormUrl,
  buildPaymentMethodRequestNotificationBody,
  createPaymentMethodRequestToken,
  PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
  PAYMENT_METHOD_REQUEST_NOTIFICATION_TYPE,
  paymentMethodRequestRecipientOptions,
  uniquePaymentRequestEmails,
} from "@/lib/payment-method-request-forms";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/supabase-auth";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function POSTHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const familyId = clean(body.familyId);
  const requestedEmails = uniquePaymentRequestEmails(stringArray(body.emails));
  if (!familyId) {
    return NextResponse.json({ ok: false, error: "Family ID is required." }, { status: 400 });
  }
  if (!requestedEmails.length) {
    return NextResponse.json({ ok: false, error: "Choose at least one family email to receive the payment form." }, { status: 400 });
  }

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      centerId: true,
      name: true,
      billingEmail: true,
      guardians: {
        select: { id: true, fullName: true, email: true, userId: true },
        orderBy: { fullName: "asc" },
      },
    },
  });
  if (!family) {
    return NextResponse.json({ ok: false, error: "Family not found." }, { status: 404 });
  }
  if (!family.centerId) {
    return NextResponse.json({ ok: false, error: "This family is not linked to a school." }, { status: 400 });
  }

  const center = await prisma.center.findUnique({
    where: { id: family.centerId },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      email: true,
      organization: {
        select: {
          tenantId: true,
          brand: { select: { name: true } },
        },
      },
    },
  });
  if (!center) {
    return NextResponse.json({ ok: false, error: "School not found for this family." }, { status: 404 });
  }
  if (center.organization.tenantId !== user.tenantId && user.role !== UserRole.PLATFORM_OWNER) {
    return NextResponse.json({ ok: false, error: "This family is outside your tenant scope." }, { status: 403 });
  }
  if (!canAccessAllCenters(user) && !canAccessCenter(user, center.id)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this family's school." }, { status: 403 });
  }

  const options = paymentMethodRequestRecipientOptions({
    billingEmail: family.billingEmail,
    guardians: family.guardians,
  });
  const optionByEmail = new Map(options.map((option) => [option.email, option]));
  const invalidEmails = requestedEmails.filter((email) => !optionByEmail.has(email));
  if (invalidEmails.length) {
    return NextResponse.json(
      { ok: false, error: "Payment forms can only be sent to emails saved on the selected family.", invalidEmails },
      { status: 400 },
    );
  }

  const appBaseUrl = getAppBaseUrl(request.url);
  const centerLabel = center.crmLocationId ?? center.name;
  const subject = `${centerLabel}: save tuition payment information`;
  const results: Array<{ email: string; ok: boolean; configured: boolean; error?: string; notified: number; formUrl: string }> = [];
  let emailsSent = 0;
  let notificationsCreated = 0;

  for (const email of requestedEmails) {
    const recipient = optionByEmail.get(email);
    if (!recipient) continue;
    const token = createPaymentMethodRequestToken({
      familyId: family.id,
      centerId: center.id,
      tenantId: center.organization.tenantId,
      email,
    });
    const formUrl = buildPaymentMethodRequestFormUrl(appBaseUrl, token);
    const text = buildPaymentMethodRequestEmailText({
      recipientLabel: recipient.label,
      familyName: family.name,
      centerLabel,
      formUrl,
    });
    const emailResult = await sendEmail({
      to: [email],
      subject,
      text,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      categories: [PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE],
      customArgs: { familyId: family.id, centerId: center.id, purpose: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE },
      tenantId: center.organization.tenantId,
    });
    await recordEmailDeliveryAttempt({
      tenantId: center.organization.tenantId,
      centerId: center.id,
      purpose: PAYMENT_METHOD_REQUEST_EMAIL_PURPOSE,
      to: [email],
      subject,
      text,
      replyTo: center.email,
      fromName: `${centerLabel} via The BEE Suite`,
      result: emailResult,
      metadata: { familyId: family.id, formUrl },
    });
    if (emailResult.ok) emailsSent += 1;

    const uniqueUserIds = Array.from(new Set(recipient.userIds.filter(Boolean)));
    if (uniqueUserIds.length) {
      const created = await prisma.notification.createMany({
        data: uniqueUserIds.map((userId) => ({
          userId,
          title: "Save tuition payment information",
          body: buildPaymentMethodRequestNotificationBody({ familyName: family.name, formUrl }),
          type: PAYMENT_METHOD_REQUEST_NOTIFICATION_TYPE,
          priority: "normal",
          expiresAt: notificationExpiresAt(new Date(), 30),
        })),
      });
      notificationsCreated += created.count;
    }

    results.push({
      email,
      ok: emailResult.ok,
      configured: emailResult.configured,
      error: emailResult.error,
      notified: uniqueUserIds.length,
      formUrl,
    });
  }

  await writeAuditLog(user, {
    centerId: center.id,
    action: "billing.payment_method_request.sent",
    resource: "Family",
    resourceId: family.id,
    metadata: {
      familyId: family.id,
      requestedEmails,
      emailsSent,
      notificationsCreated,
      failedEmails: results.filter((result) => !result.ok).map((result) => result.email),
    },
  });

  const allFailed = results.length > 0 && emailsSent === 0;
  return NextResponse.json(
    {
      ok: !allFailed,
      emailsSent,
      notificationsCreated,
      results,
      error: allFailed ? "Payment setup emails could not be sent." : undefined,
    },
    { status: allFailed ? 502 : 200 },
  );
}

export const POST = withApiLogging("POST", POSTHandler);
