import { NextRequest, NextResponse } from "next/server";
import { PaymentStatus, Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { canAccessCenter, canManageBilling, getCurrentUser, type CurrentUser } from "@/lib/auth";
import { jsonRecord } from "@/lib/billing-guardrails";
import {
  createStripeTerminalLocation,
  createStripeTerminalPaymentIntent,
  getStripeCheckoutAmounts,
  listStripeTerminalReaders,
  processStripeTerminalPaymentIntent,
  readStripeConnectedAccountId,
  registerStripeTerminalReader,
  retrieveStripeConnectedAccount,
  retrieveStripePaymentIntent,
  retrieveStripeTerminalReader,
  shouldWaiveStripePaymentOperationsFee,
  stripeConnectedAccountPaysFeesDirectly,
} from "@/lib/integrations";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { stripeConnectReadinessFromSnapshot } from "@/lib/stripe-connect-readiness";
import {
  allOpenInvoicesResponsibilitySeparated,
  invoiceResponsibilityReviewExempt,
  invoiceResponsibilitySeparation,
} from "@/lib/invoice-responsibility-separation";
import {
  AGENCY_LEDGER_ENTRY_TYPES,
  AGENCY_LEDGER_SOURCE_SYSTEM,
  parentBalanceNeedsResponsibilityReview,
  parentVisibleBillingBalanceCents,
} from "@/lib/parent-billing-visibility";
import {
  applySucceededStripeFamilyBalancePayment,
  applySucceededStripeInvoicePayment,
} from "@/lib/stripe-payment-application";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function int(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function terminalLocationId(customFields: unknown) {
  const value = clean(jsonRecord(customFields).stripeTerminalLocationId);
  return value.startsWith("tml_") ? value : null;
}

type AuthorizedTerminalCenter = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  customFields: Prisma.JsonValue;
  organization: {
    tenant: { name: string; slug: string };
    brand: { name: string; slug: string } | null;
  };
};

type AuthorizedCenterResult =
  | { response: NextResponse }
  | { user: CurrentUser; center: AuthorizedTerminalCenter; connectedAccountId: string };

async function authorizedCenter(centerId: string): Promise<AuthorizedCenterResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 }) };
  }
  if (!canManageBilling(user)) {
    return { response: NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 }) };
  }
  if (!centerId || !canAccessCenter(user, centerId)) {
    return { response: NextResponse.json({ ok: false, error: "You do not have access to this school." }, { status: 403 }) };
  }
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      customFields: true,
      organization: {
        select: {
          tenant: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });
  if (!center) {
    return { response: NextResponse.json({ ok: false, error: "School not found." }, { status: 404 }) };
  }
  const billingApproval = stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name });
  if (!billingApproval.approved) {
    return {
      response: NextResponse.json({ ok: false, error: billingApproval.blockingReason, billingApproval }, { status: 403 }),
    };
  }
  const connectedAccountId = readStripeConnectedAccountId(center.customFields);
  if (!connectedAccountId) {
    return {
      response: NextResponse.json(
        { ok: false, error: "This school needs a connected payout account before a card reader can be registered." },
        { status: 400 },
      ),
    };
  }
  return { user, center, connectedAccountId };
}

async function verifyConnectedAccount(tenantId: string, connectedAccountId: string) {
  const accountStatus = await retrieveStripeConnectedAccount(connectedAccountId, { tenantId });
  if (!accountStatus.ok || !accountStatus.account) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: accountStatus.error || "Payout status could not be confirmed." },
        { status: accountStatus.configured ? 502 : 503 },
      ),
    };
  }
  const readiness = stripeConnectReadinessFromSnapshot(accountStatus.account);
  if (!readiness.canAcceptParentPayments) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: readiness.blockingReason || "This school's connected payment account is not ready to accept card-present payments." },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, account: accountStatus.account };
}

async function GETHandler(request: NextRequest) {
  const centerId = clean(request.nextUrl.searchParams.get("centerId"));
  const amountCents = int(request.nextUrl.searchParams.get("amountCents"));
  const context = await authorizedCenter(centerId);
  if (!("user" in context)) return context.response;
  const locationId = terminalLocationId(context.center.customFields);
  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: context.center.organization.tenant.slug,
    tenantName: context.center.organization.tenant.name,
    brandSlug: context.center.organization.brand?.slug,
    brandName: context.center.organization.brand?.name,
  });
  const amounts = amountCents > 0
    ? getStripeCheckoutAmounts(amountCents, {
        paymentMethodCategory: "card",
        waiveBeeSuitePaymentOperationsFee,
        schoolPaysStripeFeesDirectly: jsonRecord(context.center.customFields).stripeFeesCollector === "stripe",
      })
    : null;
  if (!locationId) {
    return NextResponse.json({ ok: true, locationConfigured: false, readers: [], amounts });
  }
  const result = await listStripeTerminalReaders({
    locationId,
    connectedAccountId: context.connectedAccountId,
    tenantId: context.user.tenantId,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Registered card readers could not be loaded." },
      { status: result.configured ? 502 : 503 },
    );
  }
  return NextResponse.json({
    ok: true,
    locationConfigured: true,
    readers: result.readers ?? [],
    amounts,
    hardwareNote: "The web app uses Stripe smart readers over the network. USB card-reader data connections require Stripe's Android SDK.",
  });
}

async function registerReader(body: Record<string, unknown>) {
  const centerId = clean(body.centerId);
  const registrationCode = clean(body.registrationCode);
  const context = await authorizedCenter(centerId);
  if (!("user" in context)) return context.response;
  if (!registrationCode || registrationCode.length > 64) {
    return NextResponse.json({ ok: false, error: "Enter the registration code shown on the Stripe Terminal reader." }, { status: 400 });
  }
  const readiness = await verifyConnectedAccount(context.user.tenantId, context.connectedAccountId);
  if (!readiness.ok) return readiness.response;

  let locationId = terminalLocationId(context.center.customFields);
  if (!locationId) {
    if (!context.center.address || !context.center.city || !context.center.state || !context.center.postalCode) {
      return NextResponse.json(
        { ok: false, error: "Add the school's street address, city, state, and postal code before registering a card reader." },
        { status: 400 },
      );
    }
    const location = await createStripeTerminalLocation({
      displayName: context.center.name,
      address: {
        line1: context.center.address,
        city: context.center.city,
        state: context.center.state,
        postalCode: context.center.postalCode,
        country: "US",
      },
      connectedAccountId: context.connectedAccountId,
      tenantId: context.user.tenantId,
      idempotencyKey: `terminal-location:${context.center.id}`,
    });
    if (!location.ok || !location.location?.id) {
      return NextResponse.json(
        { ok: false, error: location.error || "The school's card-reader location could not be created." },
        { status: location.configured ? 502 : 503 },
      );
    }
    locationId = location.location.id;
    await prisma.center.update({
      where: { id: context.center.id },
      data: {
        customFields: jsonInput({
          ...jsonRecord(context.center.customFields),
          stripeTerminalLocationId: locationId,
          stripeTerminalLocationConfiguredAt: new Date().toISOString(),
        }),
      },
    });
  }

  const registered = await registerStripeTerminalReader({
    registrationCode,
    label: clean(body.label) || `${context.center.name} reader`,
    locationId,
    connectedAccountId: context.connectedAccountId,
    tenantId: context.user.tenantId,
    idempotencyKey: `terminal-reader:${context.center.id}:${registrationCode}`,
  });
  if (!registered.ok || !registered.reader) {
    return NextResponse.json(
      { ok: false, error: registered.error || "The card reader could not be registered." },
      { status: registered.configured ? 502 : 503 },
    );
  }
  await writeAuditLog(context.user, {
    centerId: context.center.id,
    action: "billing.terminal.reader_registered",
    resource: "Center",
    resourceId: context.center.id,
    metadata: {
      stripeTerminalReaderId: registered.reader.id,
      stripeTerminalLocationId: locationId,
      deviceType: registered.reader.deviceType,
    },
  });
  return NextResponse.json({ ok: true, reader: registered.reader });
}

async function processPayment(body: Record<string, unknown>) {
  const centerId = clean(body.centerId);
  const billingAccountId = clean(body.billingAccountId);
  const familyId = clean(body.familyId);
  const invoiceId = clean(body.invoiceId);
  const readerId = clean(body.readerId);
  const context = await authorizedCenter(centerId);
  if (!("user" in context)) return context.response;
  const readiness = await verifyConnectedAccount(context.user.tenantId, context.connectedAccountId);
  if (!readiness.ok) return readiness.response;
  if (body.parentPresent !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm that the parent is present and can review the total shown on the reader." },
      { status: 400 },
    );
  }

  const locationId = terminalLocationId(context.center.customFields);
  if (!locationId) {
    return NextResponse.json({ ok: false, error: "Register a card reader for this school first." }, { status: 400 });
  }
  if (!readerId.startsWith("tmr_")) {
    return NextResponse.json({ ok: false, error: "Choose a registered card reader." }, { status: 400 });
  }
  const reader = await retrieveStripeTerminalReader({
    readerId,
    connectedAccountId: context.connectedAccountId,
    tenantId: context.user.tenantId,
  });
  if (!reader.ok || !reader.reader) {
    return NextResponse.json(
      { ok: false, error: reader.error || "The selected card reader could not be verified." },
      { status: reader.configured ? 502 : 503 },
    );
  }
  if (reader.reader.locationId !== locationId) {
    return NextResponse.json({ ok: false, error: "That card reader is registered to a different school." }, { status: 403 });
  }
  if (reader.reader.status !== "online") {
    return NextResponse.json({ ok: false, error: "The selected card reader is offline. Connect it to the network and try again." }, { status: 409 });
  }
  if (reader.reader.actionStatus === "in_progress") {
    return NextResponse.json({ ok: false, error: "The selected card reader is already processing another action." }, { status: 409 });
  }

  const billingAccount = await prisma.billingAccount.findFirst({
    where: billingAccountId ? { id: billingAccountId } : { familyId },
    include: {
      invoices: {
        where: { status: { in: [PaymentStatus.OPEN, PaymentStatus.PAID, PaymentStatus.VOID] } },
        select: { status: true, totalCents: true, customFields: true, items: { select: { description: true } } },
      },
      ledgerEntries: {
        where: { OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] },
        select: { type: true, sourceSystem: true, amountCents: true, invoiceId: true, metadata: true },
      },
      family: {
        select: { id: true, name: true, billingEmail: true, centerId: true, customFields: true, children: { select: { customFields: true } } },
      },
    },
  });
  if (!billingAccount || billingAccount.family.centerId !== context.center.id || billingAccount.family.id !== familyId) {
    return NextResponse.json({ ok: false, error: "Billing account not found for the selected family and school." }, { status: 404 });
  }

  const invoice = invoiceId
    ? await prisma.invoice.findFirst({
        where: { id: invoiceId, billingAccountId: billingAccount.id },
        select: { id: true, number: true, totalCents: true, status: true, customFields: true, items: { select: { description: true } } },
      })
    : null;
  if (invoiceId && !invoice) {
    return NextResponse.json({ ok: false, error: "The selected invoice was not found for this family." }, { status: 404 });
  }
  if (invoice && invoice.status !== PaymentStatus.OPEN) {
    return NextResponse.json({ ok: false, error: "The selected invoice is no longer open." }, { status: 409 });
  }
  const responsibilityEvidence = [
    billingAccount.customFields,
    billingAccount.family.customFields,
    ...billingAccount.family.children.map((child) => child.customFields),
    ...billingAccount.invoices.flatMap((item) => [item.customFields, item.items.map((line) => line.description)]),
  ];
  const responsibilityReviewRequired = invoice
    ? !invoiceResponsibilityReviewExempt(invoice.customFields) && parentBalanceNeedsResponsibilityReview({
        accountBalanceCents: billingAccount.balanceCents,
        agencyLedgerEntries: billingAccount.ledgerEntries,
        invoiceId: invoice.id,
        invoiceResponsibilitySeparated: invoiceResponsibilitySeparation(invoice.customFields) !== null,
        responsibilityEvidence: [invoice.customFields, invoice.items.map((item) => item.description), ...responsibilityEvidence],
      })
    : parentBalanceNeedsResponsibilityReview({
        accountBalanceCents: billingAccount.balanceCents,
        agencyLedgerEntries: billingAccount.ledgerEntries,
        invoiceResponsibilitySeparated: allOpenInvoicesResponsibilitySeparated(billingAccount.invoices),
        responsibilityEvidence,
      });
  if (responsibilityReviewRequired) {
    return NextResponse.json({ ok: false, error: "Separate family and agency responsibility before collecting an in-person card payment." }, { status: 409 });
  }
  const requestedAmountCents = int(body.amountCents);
  const familyVisibleBalanceCents = parentVisibleBillingBalanceCents({
    accountBalanceCents: billingAccount.balanceCents,
    agencyLedgerEntries: billingAccount.ledgerEntries,
  });
  if (!invoice && requestedAmountCents > familyVisibleBalanceCents) {
    return NextResponse.json({ ok: false, error: "The in-person payment cannot exceed the family-responsibility balance." }, { status: 409 });
  }
  const amountCents = invoice?.totalCents ?? (requestedAmountCents > 0 ? requestedAmountCents : familyVisibleBalanceCents);
  if (amountCents <= 0) {
    return NextResponse.json({ ok: false, error: "Payment amount must be greater than zero." }, { status: 400 });
  }

  const activePayments = await prisma.payment.findMany({
    where: { billingAccountId: billingAccount.id, provider: "stripe_terminal", status: PaymentStatus.DRAFT },
    select: { id: true, customFields: true },
  });
  const activePayment = activePayments.find((payment) => {
    const fields = jsonRecord(payment.customFields);
    return clean(fields.status).startsWith("terminal_") && clean(fields.status) !== "terminal_failed";
  });
  if (activePayment) {
    return NextResponse.json(
      { ok: false, error: "This family already has an in-person card payment waiting on a reader.", paymentId: activePayment.id },
      { status: 409 },
    );
  }

  const waiveBeeSuitePaymentOperationsFee = shouldWaiveStripePaymentOperationsFee({
    tenantSlug: context.center.organization.tenant.slug,
    tenantName: context.center.organization.tenant.name,
    brandSlug: context.center.organization.brand?.slug,
    brandName: context.center.organization.brand?.name,
  });
  const amounts = getStripeCheckoutAmounts(amountCents, {
    paymentMethodCategory: "card_present",
    waiveBeeSuitePaymentOperationsFee,
    schoolPaysStripeFeesDirectly: stripeConnectedAccountPaysFeesDirectly(readiness.account),
  });
  const description = clean(body.description) || "In-person tuition payment";
  const payment = await prisma.payment.create({
    data: {
      billingAccountId: billingAccount.id,
      amountCents,
      status: PaymentStatus.DRAFT,
      provider: "stripe_terminal",
      externalIdPlaceholder: "payment_intent_pending",
      customFields: jsonInput({
        paymentScope: invoice ? "invoice" : "family_balance",
        invoiceId: invoice?.id || null,
        centerId: context.center.id,
        familyId: billingAccount.family.id,
        readerId,
        collectionMode: "director_card_present",
        description,
        status: "terminal_intent_pending",
      }),
    },
  });
  const metadata = {
    tenantId: context.user.tenantId,
    paymentScope: invoice ? "invoice" : "family_balance",
    billingAccountId: billingAccount.id,
    familyId: billingAccount.family.id,
    centerId: context.center.id,
    invoiceId: invoice?.id || "",
    paymentId: payment.id,
    stripeConnectedAccountId: context.connectedAccountId,
    stripeChargeType: "direct",
    stripeTerminalReaderId: readerId,
    invoiceAmountCents: String(amounts.invoiceAmountCents),
    parentSurchargeAmountCents: String(amounts.parentSurchargeAmountCents),
    parentProcessingRecoveryAmountCents: String(amounts.parentProcessingRecoveryAmountCents),
    schoolProcessingFeeAmountCents: String(amounts.schoolProcessingFeeAmountCents),
    beeSuitePaymentOperationsFeeAmountCents: String(amounts.beeSuitePaymentOperationsFeeAmountCents),
    beeSuitePaymentOperationsFeeWaived: String(waiveBeeSuitePaymentOperationsFee),
    requestedPaymentMethodCategory: "card_present",
    paymentMethodCategory: "card_present",
    checkoutTotalCents: String(amounts.checkoutTotalCents),
    applicationFeeAmountCents: String(amounts.applicationFeeAmountCents),
    collectionMode: "director_card_present",
    description,
    source: "director_dashboard",
    requestedByUserId: context.user.id,
    parentPresentConfirmed: "true",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
  };
  const intent = await createStripeTerminalPaymentIntent({
    amountCents: amounts.checkoutTotalCents,
    invoiceAmountCents: amounts.invoiceAmountCents,
    invoiceNumber: invoice?.number || `${billingAccount.family.name} family balance`,
    centerName: context.center.name,
    customerEmail: billingAccount.family.billingEmail,
    metadata,
    connectedAccountId: context.connectedAccountId,
    applicationFeeAmountCents: amounts.applicationFeeAmountCents,
    idempotencyKey: `terminal-payment:intent:${payment.id}`,
    tenantId: context.user.tenantId,
  });
  if (!intent.ok || !intent.paymentIntent?.id) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        externalIdPlaceholder: intent.error || "terminal_payment_intent_failed",
        customFields: jsonInput({ ...metadata, status: "terminal_failed", stripeError: intent.error || null }),
      },
    });
    return NextResponse.json(
      { ok: false, error: intent.error || "The card-present payment could not be created." },
      { status: intent.configured ? 502 : 503 },
    );
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      externalIdPlaceholder: intent.paymentIntent.id,
      customFields: jsonInput({
        ...metadata,
        stripePaymentIntentId: intent.paymentIntent.id,
        stripePaymentIntentStatus: intent.paymentIntent.status || null,
        status: "terminal_ready",
      }),
    },
  });
  const processed = await processStripeTerminalPaymentIntent({
    readerId,
    paymentIntentId: intent.paymentIntent.id,
    connectedAccountId: context.connectedAccountId,
    tenantId: context.user.tenantId,
    idempotencyKey: `terminal-payment:reader:${payment.id}`,
  });
  if (!processed.ok || !processed.reader) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        customFields: jsonInput({
          ...metadata,
          stripePaymentIntentId: intent.paymentIntent.id,
          stripePaymentIntentStatus: intent.paymentIntent.status || null,
          status: "terminal_failed",
          stripeError: processed.error || null,
        }),
      },
    });
    return NextResponse.json(
      { ok: false, error: processed.error || "The reader could not start the card-present payment." },
      { status: processed.configured ? 502 : 503 },
    );
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      customFields: jsonInput({
        ...metadata,
        stripePaymentIntentId: intent.paymentIntent.id,
        stripePaymentIntentStatus: intent.paymentIntent.status || null,
        stripeTerminalReaderId: processed.reader.id,
        stripeTerminalReaderActionStatus: processed.reader.actionStatus,
        status: "terminal_processing",
      }),
    },
  });
  await writeAuditLog(context.user, {
    centerId: context.center.id,
    action: "billing.terminal.payment_started",
    resource: invoice ? "Invoice" : "BillingAccount",
    resourceId: invoice?.id || billingAccount.id,
    metadata: {
      paymentId: payment.id,
      stripePaymentIntentId: intent.paymentIntent.id,
      stripeTerminalReaderId: readerId,
      amountCents,
      checkoutTotalCents: amounts.checkoutTotalCents,
    },
  });
  return NextResponse.json({
    ok: true,
    status: "processing",
    paymentId: payment.id,
    stripePaymentIntentId: intent.paymentIntent.id,
    reader: processed.reader,
  });
}

async function paymentStatus(body: Record<string, unknown>) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBilling(user)) {
    return NextResponse.json({ ok: false, error: "Billing access is not allowed for this role." }, { status: 403 });
  }
  const paymentId = clean(body.paymentId);
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      billingAccount: {
        include: {
          family: { select: { id: true, centerId: true } },
        },
      },
    },
  });
  if (!payment || payment.provider !== "stripe_terminal" || !payment.billingAccount.family.centerId) {
    return NextResponse.json({ ok: false, error: "In-person payment not found." }, { status: 404 });
  }
  const context = await authorizedCenter(payment.billingAccount.family.centerId);
  if (!("user" in context)) return context.response;
  const fields = jsonRecord(payment.customFields);
  const paymentIntentId = clean(fields.stripePaymentIntentId);
  if (!paymentIntentId.startsWith("pi_")) {
    return NextResponse.json({ ok: false, error: "The payment is missing its processor confirmation reference." }, { status: 409 });
  }
  if (payment.status === PaymentStatus.PAID) {
    return NextResponse.json({ ok: true, status: "succeeded", paymentId: payment.id });
  }
  if (payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.VOID) {
    return NextResponse.json({ ok: false, status: "failed", error: clean(fields.stripeError) || "The in-person payment did not complete." });
  }
  const intent = await retrieveStripePaymentIntent({
    paymentIntentId,
    connectedAccountId: context.connectedAccountId,
    tenantId: context.user.tenantId,
  });
  if (!intent.ok || !intent.paymentIntent) {
    return NextResponse.json(
      { ok: false, error: intent.error || "The card-present payment status could not be checked." },
      { status: intent.configured ? 502 : 503 },
    );
  }
  if (intent.paymentIntent.status === "succeeded") {
    const metadata = { ...fields, stripePaymentIntentStatus: "succeeded" };
    const invoiceId = clean(fields.invoiceId);
    const application = await prisma.$transaction((tx) => invoiceId
      ? applySucceededStripeInvoicePayment(tx, {
          invoiceId,
          paymentId: payment.id,
          externalId: paymentIntentId,
          stripePaymentIntentId: paymentIntentId,
          stripePaymentIntentStatus: "succeeded",
          stripeAmountTotalCents: intent.paymentIntent?.amountCents ?? null,
          metadata,
        })
      : applySucceededStripeFamilyBalancePayment(tx, {
          paymentId: payment.id,
          externalId: paymentIntentId,
          stripePaymentIntentId: paymentIntentId,
          stripePaymentStatus: "succeeded",
          stripePaymentIntentStatus: "succeeded",
          stripeAmountTotalCents: intent.paymentIntent?.amountCents ?? null,
          metadata,
          descriptionFallback: "In-person card payment",
        }));
    if (!application.applied && application.reason !== "payment_already_applied") {
      return NextResponse.json(
        { ok: false, status: "review", error: `The processor confirmed payment, but the billing ledger needs review (${application.reason || "not_applied"}).` },
        { status: 409 },
      );
    }
    await writeAuditLog(context.user, {
      centerId: context.center.id,
      action: "billing.terminal.payment_succeeded",
      resource: invoiceId ? "Invoice" : "BillingAccount",
      resourceId: invoiceId || payment.billingAccountId,
      metadata: { paymentId: payment.id, stripePaymentIntentId: paymentIntentId },
    });
    return NextResponse.json({ ok: true, status: "succeeded", paymentId: payment.id });
  }

  const readerId = clean(fields.stripeTerminalReaderId);
  const reader = readerId
    ? await retrieveStripeTerminalReader({
        readerId,
        connectedAccountId: context.connectedAccountId,
        tenantId: context.user.tenantId,
      })
    : null;
  const readerFailure = reader?.reader?.actionStatus === "failed";
  const terminalStatus = readerFailure || intent.paymentIntent.status === "canceled" ? "failed" : "processing";
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      ...(terminalStatus === "failed" ? { status: PaymentStatus.FAILED } : {}),
      customFields: jsonInput({
        ...fields,
        stripePaymentIntentStatus: intent.paymentIntent.status || null,
        stripeTerminalReaderActionStatus: reader?.reader?.actionStatus || null,
        stripeTerminalReaderFailureCode: reader?.reader?.actionFailureCode || null,
        stripeError: reader?.reader?.actionFailureMessage || null,
        status: terminalStatus === "failed" ? "terminal_failed" : "terminal_processing",
      }),
    },
  });
  if (terminalStatus === "failed") {
    await writeAuditLog(context.user, {
      centerId: context.center.id,
      action: "billing.terminal.payment_failed",
      resource: "Payment",
      resourceId: payment.id,
      metadata: { stripePaymentIntentId: paymentIntentId, paymentIntentStatus: intent.paymentIntent.status },
    });
  }
  return NextResponse.json({
    ok: terminalStatus !== "failed",
    status: terminalStatus,
    paymentId: payment.id,
    paymentIntentStatus: intent.paymentIntent.status,
    reader: reader?.reader || null,
    error: terminalStatus === "failed" ? reader?.reader?.actionFailureMessage || "The card-present payment failed." : undefined,
  });
}

async function POSTHandler(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = clean(body.action);
  if (action === "register_reader") return registerReader(body);
  if (action === "process_payment") return processPayment(body);
  if (action === "payment_status") return paymentStatus(body);
  return NextResponse.json({ ok: false, error: "Unsupported card-reader action." }, { status: 400 });
}

export const GET = withApiLogging("GET", GETHandler);
export const POST = withApiLogging("POST", POSTHandler);
