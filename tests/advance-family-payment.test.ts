import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PaymentStatus, type Prisma } from "@prisma/client";
import { familyPaymentAmountError } from "../src/lib/family-payment-amount";
import { visibleBillingFamilyWhere, visibleBillingFamilySearchWhere, visibleCenterIdFilter } from "../src/lib/corporate-view-scope";
import { billingFamilyAccountCategory, childTuitionEligibilityError } from "../src/lib/prospective-family-billing";
import { matchesPrismaWhere } from "./helpers/matches-prisma-where";
import { invoiceVoidBlocker, invoiceLedgerBalanceCents } from "../src/lib/invoice-void";
import { applySucceededStripeFamilyBalancePayment, applyAccountCreditToInvoice } from "../src/lib/stripe-payment-application";
import { applyFamilyPaymentRefund, familyRefundDelta } from "../src/lib/family-payment-refund";
import { createBillingInvoiceForFamily } from "../src/lib/billing-invoices";
import { allocateAccountCreditToInvoice, availableAccountCreditCents } from "../src/lib/account-credit-autopay";

test("withdrawn families remain selectable at zero balance within their authorized school", () => {
  const family = { centerId: "school-a", children: [{ enrollmentStatus: "withdrawn", classroomId: null }], billingAccount: { balanceCents: 0 } };
  assert.equal(matchesPrismaWhere(family, visibleBillingFamilyWhere(["school-a"])), true);
  assert.equal(matchesPrismaWhere(family, visibleBillingFamilyWhere(["school-b"])), false);
  assert.equal(matchesPrismaWhere(family, visibleBillingFamilyWhere([])), false);
  assert.equal(billingFamilyAccountCategory(family.children), "past");
  assert.ok(childTuitionEligibilityError(family.children[0]));
  assert.deepEqual(visibleBillingFamilyWhere(["school-a"]), { centerId: visibleCenterIdFilter(["school-a"]) });
});

test("an established erroneous post-withdrawal unpaid invoice is reversed, never cleared with a payment", () => {
  const invoice = { status: PaymentStatus.OPEN, totalCents: 24000, sourceSystem: "bee_suite",
    ledgerEntries: [{ amountCents: 24000, paymentId: null }], payments: [] };
  assert.equal(invoiceVoidBlocker(invoice), null);
  assert.equal(24000 - invoiceLedgerBalanceCents(invoice.ledgerEntries), 0);
  assert.ok(invoiceVoidBlocker({ ...invoice, payments: [{ status: PaymentStatus.DRAFT, provider: "stripe" }] }));
  const route = readFileSync("src/app/api/billing/invoices/route.ts", "utf8");
  const voidSection = route.slice(route.indexOf("async function voidInvoice"), route.indexOf("async function voidInvoice") + 8500);
  assert.match(voidSection, /type: "invoice_void"/);
  assert.match(voidSection, /billing\.invoice\.voided/);
  assert.doesNotMatch(voidSection, /payment\.create/);
  const cron = readFileSync("src/app/api/cron/tuition-billing/route.ts", "utf8");
  assert.match(cron, /FROM "Child"[\s\S]*FOR UPDATE/);
  assert.match(cron, /freshChild[\s\S]*currentlyEnrolledChildWhere\(\)[\s\S]*tuitionBillingEnabled/);
});

test("zero-balance and above-balance advance payments require explicit custom intent", () => {
  const input = { amountCents: 24000, collectableCents: 0, advancePayment: true, explicitAmount: true };
  assert.equal(familyPaymentAmountError(input), null);
  assert.ok(familyPaymentAmountError({ ...input, advancePayment: false }));
  assert.ok(familyPaymentAmountError({ ...input, explicitAmount: false }));
  for (const amountCents of [0, -1, 1.2, NaN, 100_000_000]) assert.ok(familyPaymentAmountError({ ...input, amountCents }));
  assert.equal(familyPaymentAmountError({ ...input, collectableCents: 10000 }), null);
  assert.equal(familyPaymentAmountError({ ...input, amountCents: 10000, collectableCents: 10000, advancePayment: false }), null);
});

function fixture(balanceCents = 0) {
  const state = { account: { id: "account", balanceCents }, payment: { id: "payment", billingAccountId: "account", amountCents: 24000,
    status: PaymentStatus.DRAFT as PaymentStatus, customFields: { checkoutTotalCents: 24000, advancePayment: "true" } as Record<string, unknown> },
    invoices: [] as Array<{ id: string; billingAccountId: string; status: PaymentStatus; totalCents: number; customFields: Record<string, unknown> }>,
    ledger: [] as Array<Record<string, unknown>> };
  const tx = {
    $queryRaw: async () => [],
    payment: {
      findUnique: async () => structuredClone(state.payment), findUniqueOrThrow: async () => structuredClone(state.payment),
      update: async ({ data }: { data: object }) => { Object.assign(state.payment, data); return structuredClone(state.payment); },
      updateMany: async ({ where, data }: { where: { status: PaymentStatus }; data: object }) => {
        if (state.payment.status !== where.status) return { count: 0 }; Object.assign(state.payment, data); return { count: 1 };
      }, findMany: async () => [],
    },
    billingAccount: {
      findUnique: async () => structuredClone(state.account),
      update: async ({ data }: { data: { balanceCents: { decrement?: number; increment?: number } } }) => {
        state.account.balanceCents += (data.balanceCents.increment ?? 0) - (data.balanceCents.decrement ?? 0); return structuredClone(state.account);
      },
    },
    invoice: {
      findUnique: async ({ where }: { where: { id: string } }) => structuredClone(state.invoices.find(i => i.id === where.id)),
      findMany: async ({ where }: { where?: { status?: PaymentStatus } } = {}) => structuredClone(state.invoices.filter(i => i.status === (where?.status ?? PaymentStatus.OPEN))),
      aggregate: async () => ({ _sum: { totalCents: state.invoices.filter(i => i.status === PaymentStatus.OPEN).reduce((s,i) => s + i.totalCents, 0) } }),
      updateMany: async ({ where, data }: { where: { id: string; status: PaymentStatus; billingAccountId?: string }; data: object }) => {
        const invoice = state.invoices.find(i => i.id === where.id && i.status === where.status && (!where.billingAccountId || i.billingAccountId === where.billingAccountId));
        if (!invoice) return { count: 0 }; Object.assign(invoice, data); return { count: 1 };
      },
    },
    ledgerEntry: { findFirst: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => {
      state.ledger.push(structuredClone(data)); return data;
    } },
  } as unknown as Prisma.TransactionClient;
  return { state, tx };
}

test("successful prepayment and duplicate webhook delivery produce one household credit", async () => {
  const f = fixture();
  const event = { paymentId: "payment", externalId: "pi_fake", stripePaymentIntentId: "pi_fake", stripeAmountTotalCents: 24000 };
  assert.equal((await applySucceededStripeFamilyBalancePayment(f.tx, event)).applied, true);
  assert.equal(f.state.account.balanceCents, -24000);
  assert.equal(f.state.ledger.length, 1);
  assert.equal((await applySucceededStripeFamilyBalancePayment(f.tx, { ...event, stripeEventId: "second-delivery" })).reason, "payment_already_applied");
  assert.equal(f.state.account.balanceCents, -24000);
  assert.equal(f.state.ledger.length, 1);
});

test("future invoices consume full and partial credit without another balance decrement", async () => {
  const f = fixture(-24000);
  f.state.invoices.push({ id: "invoice1", billingAccountId: "account", status: PaymentStatus.OPEN, totalCents: 16000, customFields: {} });
  f.state.account.balanceCents += 16000;
  assert.equal((await applyAccountCreditToInvoice(f.tx, { invoiceId: "invoice1" })).applied, true);
  assert.equal(f.state.account.balanceCents, -8000);
  assert.equal(f.state.ledger[0].amountCents, 0);
  f.state.invoices.push({ id: "invoice2", billingAccountId: "account", status: PaymentStatus.OPEN, totalCents: 16000, customFields: {} });
  f.state.account.balanceCents += 16000;
  const allocation = await applyAccountCreditToInvoice(f.tx, { invoiceId: "invoice2" });
  assert.equal(allocation.accountCreditAppliedCents, 8000);
  assert.equal(allocation.stripeChargePrincipalCents, 8000);
  assert.equal(f.state.account.balanceCents, 8000);
  assert.deepEqual(allocateAccountCreditToInvoice({ invoiceTotalCents: 16000, availableCreditCents:
    availableAccountCreditCents({ balanceCents: 8000, openInvoiceTotalCents: 16000 }) }),
    { invoiceTotalCents: 16000, accountCreditAppliedCents: 8000, stripeChargePrincipalCents: 8000, fullyCoveredByCredit: false });
});

test("advance-payment refunds reverse credit once, including duplicate and older cumulative events", async () => {
  const f = fixture(-24000); f.state.payment.status = PaymentStatus.PAID;
  const event = { paymentId: "payment", chargeId: "ch_fake", paymentIntentId: "pi_fake", eventId: "evt1", cumulativeRefundedCents: 6000, invoiceId: null };
  await applyFamilyPaymentRefund(f.tx, event);
  assert.equal(f.state.account.balanceCents, -18000);
  await applyFamilyPaymentRefund(f.tx, { ...event, eventId: "evt2" });
  await applyFamilyPaymentRefund(f.tx, { ...event, eventId: "evt3", cumulativeRefundedCents: 3000 });
  assert.equal(f.state.account.balanceCents, -18000); assert.equal(f.state.ledger.length, 1);
  await applyFamilyPaymentRefund(f.tx, { ...event, eventId: "evt4", cumulativeRefundedCents: 24000 });
  assert.equal(f.state.account.balanceCents, 0); assert.equal(f.state.ledger.length, 2);
  assert.equal(f.state.payment.status, PaymentStatus.REFUNDED);
  assert.equal(familyRefundDelta({ principalCents: 24000, previouslyRefundedCents: 24000, providerRefundedCents: 25000 }).principalDeltaCents, 0);
});


test("refunding consumed advance credit reopens a future invoice without a second charge", async () => {
  const f = fixture(-8000);
  f.state.payment.status = PaymentStatus.PAID;
  f.state.invoices.push({ id: "future", billingAccountId: "account", status: PaymentStatus.PAID, totalCents: 16000, customFields: { paidByAccountCredit: true } });
  await applyFamilyPaymentRefund(f.tx, { paymentId: "payment", chargeId: "ch_fake", paymentIntentId: "pi_fake", eventId: "refund", cumulativeRefundedCents: 24000, invoiceId: null, refundId: "re_fake" });
  assert.equal(f.state.account.balanceCents, 16000);
  assert.equal(f.state.invoices[0].status, PaymentStatus.OPEN);
  await applyFamilyPaymentRefund(f.tx, { paymentId: "payment", chargeId: "ch_fake", paymentIntentId: "pi_fake", eventId: "retry", cumulativeRefundedCents: 48000, invoiceId: null, refundId: "re_fake" });
  assert.equal(f.state.account.balanceCents, 16000);
  assert.equal(f.state.ledger.length, 1);
});


test("historical account search is scoped before loading a bounded family list", () => {
  const where = visibleBillingFamilySearchWhere(["school-a"], "  HERNANDEZ  ");
  assert.deepEqual(where.AND && (where.AND as object[])[0], visibleBillingFamilyWhere(["school-a"]));
  assert.match(JSON.stringify(where), /"contains":"HERNANDEZ","mode":"insensitive"/);
  assert.match(JSON.stringify(where), /"children"/); assert.match(JSON.stringify(where), /"guardians"/);
  assert.deepEqual(visibleBillingFamilySearchWhere([], " "), visibleBillingFamilyWhere([]));
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /where: visibleBillingFamilySearchWhere\(visibleCenterIds, requestedBillingSearch\),[\s\S]*?take: 1000/);
});

test("director refund keys remain distinct for equal amounts on separate payments without stored charge IDs", async () => {
  const keys = [];
  for (const refundId of ["re_one", "re_two"]) {
    const f = fixture(-24000); f.state.payment.status = PaymentStatus.PAID;
    await applyFamilyPaymentRefund(f.tx, { paymentId: "payment", chargeId: "", paymentIntentId: "pi_fake", eventId: refundId, cumulativeRefundedCents: 24000, invoiceId: null, refundId });
    keys.push(f.state.ledger[0].externalId);
  }
  assert.deepEqual(keys, ["stripe-refund:re_one", "stripe-refund:re_two"]);
});

test("confirmed family-only future tuition consumes credit despite unrelated historical agency activity", async () => {
  for (const funding of ["family", "agency"]) {
    const f = fixture(-24000);
    const delegates = f.tx as unknown as { billingAccount: Record<string, unknown>; invoice: Record<string, unknown>; ledgerEntry: Record<string, unknown>; center: Record<string, unknown> };
    delegates.billingAccount.upsert = async () => ({ ...f.state.account, family: { centerId: "school-a", children: [{ id: "child", customFields: { tuitionFundingType: funding, tuitionBillingEnabled: true, tuitionPlanId: "plan", tuitionPlanAmountCents: 16000 } }] } });
    delegates.invoice.create = async ({ data }: { data: { customFields: Record<string, unknown>; totalCents: number } }) => {
      const invoice = { ...data, id: "future", billingAccountId: "account", status: PaymentStatus.OPEN };
      f.state.invoices.push(invoice); return invoice;
    };
    delegates.ledgerEntry.findFirst = async ({ where }: { where: { OR?: unknown } }) => where.OR ? { id: "old-agency-entry" } : null;
    delegates.center = { update: async () => ({}) };
    await createBillingInvoiceForFamily(f.tx, { familyId: "family", dueDate: new Date("2026-10-05"), items: [{ description: "Tuition", amountCents: 16000 }], description: "Tuition", customFields: { chargeSource: "tuitionPlan", sourceId: "plan", childId: "child", invoiceWeekCount: 1 } });
    assert.equal(f.state.account.balanceCents, -8000);
    assert.equal(f.state.invoices[0].status, funding === "family" ? PaymentStatus.PAID : PaymentStatus.OPEN);
    assert.equal(f.state.ledger.filter(entry => entry.type === "account_credit_application").length, funding === "family" ? 1 : 0);
  }
});
