import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isParentGuardian } from "@/lib/auth";
import { getParentPortalPaymentFamilyScope } from "@/lib/parent-portal-family-scope";
import { parentPaymentStatus } from "@/lib/parent-payment-status";
import { isPaymentObservationId, type ParentPaymentObservation } from "@/lib/parent-payment-observation";
import { jsonRecord } from "@/lib/billing-guardrails";
import { isReturnedStripePayment } from "@/lib/ach-payment-lifecycle";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
const select = { id: true, amountCents: true, status: true, provider: true, customFields: true } as const;
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false, error: "Sign in again to check payment status." }, 401);
  if (!isParentGuardian(user)) return reply({ ok: false, error: "Parent or guardian access is required." }, 403);
  const params = request.nextUrl.searchParams;
  const familyId = params.get("familyId"), requestNonce = params.get("requestNonce");
  const invoiceId = params.get("invoiceId"), paymentId = params.get("paymentId");
  if ([...params.keys()].some(key => !["familyId", "requestNonce", "invoiceId", "paymentId"].includes(key) || params.getAll(key).length !== 1)
    || !isPaymentObservationId(familyId) || !isPaymentObservationId(requestNonce)
    || (invoiceId !== null && !isPaymentObservationId(invoiceId)) || (paymentId !== null && !isPaymentObservationId(paymentId))) {
    return reply({ ok: false, error: "Choose a family and refresh the payment status." }, 400);
  }
  const scope = await getParentPortalPaymentFamilyScope(user.id, user.tenantId, familyId);
  if (!scope.ok || scope.familyId !== familyId) return reply({ ok: false, error: "This family is not available to your account." }, 403);
  const account = await prisma.billingAccount.findFirst({ where: { familyId: scope.familyId }, select: { id: true } });
  if (!account) return reply({ ok: false, error: "Your family billing account is not available. Contact your school." }, 404);
  if (invoiceId && !await prisma.invoice.findFirst({ where: { id: invoiceId, billingAccountId: account.id }, select: { id: true } })) {
    return reply({ ok: false, error: "This invoice is not available to your account." }, 404);
  }
  // Complete authorized account scope. No provider calls, reconciliation, expiry, or writes.
  const drafts = await prisma.payment.findMany({ where: { billingAccountId: account.id, status: "DRAFT", provider: { in: ["stripe", "stripe_terminal"] } }, select });
  const summary = parentPaymentStatus(drafts);
  const invoiceIds = [...summary.byInvoiceId.keys()];
  const authorizedInvoices = invoiceIds.length ? await prisma.invoice.findMany({
    where: { billingAccountId: account.id, id: { in: invoiceIds } }, select: { id: true },
  }) : [];
  const authorizedIds = new Set(authorizedInvoices.map(invoice => invoice.id));
  // Corrupt metadata is not authorization to disclose another account's invoice identifier.
  const invoicePayments = [...summary.byInvoiceId].filter(([id]) => authorizedIds.has(id)).map(([id, payment]) => ({ invoiceId: id, payment }));
  let outcome: ParentPaymentObservation["outcome"] = "unidentified";
  if (paymentId) {
    const attempt = await prisma.payment.findFirst({ where: { id: paymentId, billingAccountId: account.id, provider: { in: ["stripe", "stripe_terminal"] } }, select });
    if (!attempt || (invoiceId && jsonRecord(attempt.customFields).invoiceId !== invoiceId)) {
      return reply({ ok: false, error: "This payment receipt is not available for the selected account." }, 404);
    }
    const fields = jsonRecord(attempt.customFields);
    outcome = attempt.status === "PAID" && !isReturnedStripePayment(attempt) && fields.stripeDisputeLedgerActive !== true
      && !String(fields.status ?? "").includes("unknown") && !["processing", "requires_capture"].includes(String(fields.stripePaymentIntentStatus ?? ""))
      ? "settled" : parentPaymentStatus([attempt]).accountPaymentBlocker ? "active" : "unresolved";
  }
  return reply({ ok: true, version: 1, familyId, invoiceId, paymentId, requestNonce, observedAt: new Date().toISOString(),
    accountPaymentBlocker: summary.accountPaymentBlocker, invoicePayments, outcome } satisfies ParentPaymentObservation);
}

export const GET = withApiLogging("GET", async (request: NextRequest) => {
  try { return await GETHandler(request); }
  catch { return reply({ ok: false, error: "Payment status could not be checked. Keep this payment paused and try refreshing again." }, 503); }
}, { omitRequestBody: true, omitResponseBody: true });
