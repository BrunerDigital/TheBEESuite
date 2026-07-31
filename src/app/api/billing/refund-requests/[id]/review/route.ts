import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, getCurrentUser } from "@/lib/auth";
import { issueFamilyRefund } from "@/lib/family-refunds";
import { isExecutiveRefundApproverRole, validateRefundDecisionInput } from "@/lib/refund-approval";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function moneyLabel(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function notifyRequester(input: {
  requestId: string;
  requesterId: string;
  title: string;
  body: string;
  decision: "approved" | "denied";
}) {
  await prisma.notification.create({
    data: {
      userId: input.requesterId,
      title: input.title,
      body: input.body,
      type: "refund_decision",
      priority: input.decision === "approved" ? "normal" : "high",
      dedupeKey: `refund-decision:${input.requestId}:${input.decision}:${input.requesterId}`,
    },
  });
}

async function PATCHHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!isExecutiveRefundApproverRole(user.role)) {
    return NextResponse.json({ ok: false, error: "Executive refund approval is required." }, { status: 403 });
  }

  const body = jsonObject(await request.json().catch(() => ({})));
  const decision = validateRefundDecisionInput(body.action, body.reason);
  if (!decision.ok) {
    return NextResponse.json({ ok: false, error: decision.error }, { status: 400 });
  }

  const { id } = await context.params;
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      centerId: true,
      familyId: true,
      requestedById: true,
      amountCents: true,
      reason: true,
      selectedPaymentIds: true,
      status: true,
      family: { select: { name: true } },
      center: { select: { name: true, crmLocationId: true } },
    },
  });
  if (!refundRequest) {
    return NextResponse.json({ ok: false, error: "Refund request not found." }, { status: 404 });
  }
  if (!canAccessCenter(user, refundRequest.centerId)) {
    return NextResponse.json({ ok: false, error: "You do not have access to this refund request." }, { status: 403 });
  }
  if (refundRequest.status !== "pending") {
    return NextResponse.json({ ok: false, error: "This refund request has already been reviewed." }, { status: 409 });
  }

  const now = new Date();
  const schoolName = refundRequest.center.crmLocationId || refundRequest.center.name;
  if (decision.action === "deny") {
    const updated = await prisma.refundRequest.updateMany({
      where: { id: refundRequest.id, status: "pending" },
      data: {
        status: "denied",
        reviewedById: user.id,
        decisionReason: decision.reason,
        reviewedAt: now,
        failureReason: null,
      },
    });
    if (!updated.count) {
      return NextResponse.json({ ok: false, error: "Another executive already reviewed this request." }, { status: 409 });
    }

    await Promise.all([
      prisma.auditLog.create({
        data: {
          tenantId: refundRequest.tenantId,
          centerId: refundRequest.centerId,
          userId: user.id,
          action: "billing.refund.denied",
          resource: "RefundRequest",
          resourceId: refundRequest.id,
          metadata: {
            familyId: refundRequest.familyId,
            amountCents: refundRequest.amountCents,
            requestReason: refundRequest.reason,
            decisionReason: decision.reason,
          },
        },
      }),
      notifyRequester({
        requestId: refundRequest.id,
        requesterId: refundRequest.requestedById,
        title: "Refund request denied",
        body: `The ${moneyLabel(refundRequest.amountCents)} refund for ${refundRequest.family.name} at ${schoolName} was denied by ${user.name || user.email}. Reason: ${decision.reason}`,
        decision: "denied",
      }),
    ]);
    return NextResponse.json({ ok: true, status: "denied" });
  }

  const claimed = await prisma.refundRequest.updateMany({
    where: { id: refundRequest.id, status: "pending" },
    data: {
      status: "processing",
      failureReason: null,
    },
  });
  if (!claimed.count) {
    return NextResponse.json({ ok: false, error: "Another executive already reviewed this request." }, { status: 409 });
  }

  const result = await issueFamilyRefund(user, {
    familyId: refundRequest.familyId,
    amountCents: refundRequest.amountCents,
    reason: refundRequest.reason,
    preferredPaymentIds: refundRequest.selectedPaymentIds,
    operationId: refundRequest.id,
    tenantId: refundRequest.tenantId,
  });
  if (!result.ok) {
    await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: "pending",
        failureReason: result.error,
      },
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: "approved",
      reviewedById: user.id,
      decisionReason: decision.reason,
      reviewedAt: now,
      processedAt: new Date(),
      processedAmountCents: result.totalCents,
      allocations: result.allocations,
      failureReason: result.warning,
    },
  });
  await Promise.all([
    prisma.auditLog.create({
      data: {
        tenantId: refundRequest.tenantId,
        centerId: refundRequest.centerId,
        userId: user.id,
        action: "billing.refund.approved",
        resource: "RefundRequest",
        resourceId: refundRequest.id,
        metadata: {
          familyId: refundRequest.familyId,
          requestedAmountCents: refundRequest.amountCents,
          processedAmountCents: result.totalCents,
          requestReason: refundRequest.reason,
          decisionReason: decision.reason,
          partial: result.partial,
        },
      },
    }),
    notifyRequester({
      requestId: refundRequest.id,
      requesterId: refundRequest.requestedById,
      title: "Refund request approved",
      body: `${moneyLabel(result.totalCents)} was refunded for ${refundRequest.family.name} at ${schoolName} after approval by ${user.name || user.email}. Approval reason: ${decision.reason}${result.warning ? ` ${result.warning}` : ""}`,
      decision: "approved",
    }),
  ]);

  return NextResponse.json({
    ok: true,
    status: "approved",
    totalCents: result.totalCents,
    partial: result.partial,
    warning: result.warning,
  });
}

export const PATCH = withApiLogging("PATCH", PATCHHandler);
