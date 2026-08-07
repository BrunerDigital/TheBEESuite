import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { retrieveStripeCheckoutSession } from "@/lib/integrations";
import { invoiceLedgerBalanceCents } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";
import { resolveStripeCheckoutDraftBlocker } from "@/lib/stripe-checkout-drafts";

const PERIOD = "2026-W33";
const RECOVERY_FINGERPRINT = "88b30b0be5cea0cd908a62cdd8f7d1784f1bca309133f3955bf4e67b4b89efad";
const LONGMONT_ID = "cmp4ew6f3000a6alwmz62n7w2";
const LONGMONT_NAME = "Kid City USA - Longmont";
const CORDERA_ID = "cmp4ew5yx00046alw8i1yf63m";
const CORDERA_NAME = "Kid City USA - Cordera (Colorado Springs)";
const KREMPASKY_RECOVERY_NUMBER = "INV-20260807-1FE249CD";
const KREMPASKY_PRIOR_NUMBER = "INV-20260806-038F6483";
const LONGMONT_EXPECTED_COUNT = 25;
const LONGMONT_EXPECTED_CENTS = 845_575;
const TOTAL_EXPECTED_COUNT = 26;
const TOTAL_EXPECTED_CENTS = 850_575;
const APPLY = "--apply";
const CONFIRM = "--confirm-other-school-w33-duplicate-rollback";
const FINGERPRINT_ARG = "--confirm-fingerprint=";
const REASON = "W33 recovery duplicate rollback: an earlier school-created tuition invoice already billed the same child, amount, and August 6 billing date.";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function arg(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function sameUtcDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

async function loadState() {
  const centers = await prisma.center.findMany({
    where: { id: { in: [LONGMONT_ID, CORDERA_ID] } },
    select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } },
  });
  invariant(centers.find((center) => center.id === LONGMONT_ID)?.name === LONGMONT_NAME, "Longmont identity changed.");
  invariant(centers.find((center) => center.id === CORDERA_ID)?.name === CORDERA_NAME, "Cordera identity changed.");
  invariant(centers.every((center) => center.status !== "closed"), "A target center is closed.");

  const recoveryInvoices = await prisma.invoice.findMany({
    where: {
      billingAccount: { family: { centerId: { in: [LONGMONT_ID, CORDERA_ID] } } },
      customFields: { path: ["recoveryManifestFingerprint"], equals: RECOVERY_FINGERPRINT },
    },
    select: {
      id: true,
      number: true,
      status: true,
      totalCents: true,
      dueDate: true,
      createdAt: true,
      customFields: true,
      ledgerEntries: { select: { id: true, amountCents: true, type: true, paymentId: true } },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          family: { select: { id: true, name: true, centerId: true } },
          payments: { where: { status: PaymentStatus.DRAFT }, select: { id: true, amountCents: true, status: true, provider: true, externalIdPlaceholder: true, customFields: true } },
          invoices: {
            where: { createdAt: { gte: new Date("2026-08-04T00:00:00.000Z"), lt: new Date("2026-08-07T16:14:00.000Z") } },
            select: { id: true, number: true, status: true, totalCents: true, dueDate: true, createdAt: true, customFields: true, ledgerEntries: { select: { paymentId: true, amountCents: true, type: true } } },
          },
        },
      },
    },
    orderBy: { number: "asc" },
  });
  const longmont = recoveryInvoices.filter((invoice) => invoice.billingAccount.family.centerId === LONGMONT_ID);
  invariant(longmont.length === LONGMONT_EXPECTED_COUNT, `Expected ${LONGMONT_EXPECTED_COUNT} Longmont recovery invoices; found ${longmont.length}.`);
  invariant(longmont.reduce((sum, invoice) => sum + invoice.totalCents, 0) === LONGMONT_EXPECTED_CENTS, "Longmont recovery amount changed.");

  const targets = recoveryInvoices.filter((invoice) => invoice.billingAccount.family.centerId === LONGMONT_ID || invoice.number === KREMPASKY_RECOVERY_NUMBER);
  invariant(targets.length === TOTAL_EXPECTED_COUNT, `Expected ${TOTAL_EXPECTED_COUNT} exact duplicate recovery invoices; found ${targets.length}.`);
  invariant(targets.reduce((sum, invoice) => sum + invoice.totalCents, 0) === TOTAL_EXPECTED_CENTS, "Exact duplicate recovery amount changed.");

  const resolved = targets.map((invoice) => {
    const fields = object(invoice.customFields);
    invariant(invoice.status === PaymentStatus.OPEN, `${invoice.number} is no longer open.`);
    invariant(fields.billingPeriod === PERIOD && fields.coverageStartsPeriod === PERIOD, `${invoice.number} is not W33 recovery tuition.`);
    invariant(fields.noPaymentSubmitted === true && fields.autopaySuppressed === true, `${invoice.number} lost its no-payment safeguards.`);
    invariant(invoiceLedgerBalanceCents(invoice.ledgerEntries) === invoice.totalCents, `${invoice.number} ledger is not an unpaid reversible charge.`);
    invariant(invoice.ledgerEntries.every((entry) => !entry.paymentId), `${invoice.number} has a linked payment.`);
    const childId = string(fields.childId);
    const scheduledChargeDate = new Date(string(fields.scheduledChargeDate));
    invariant(childId && Number.isFinite(scheduledChargeDate.getTime()), `${invoice.number} recovery identity is incomplete.`);

    let prior;
    if (invoice.number === KREMPASKY_RECOVERY_NUMBER) {
      prior = invoice.billingAccount.invoices.find((candidate) => candidate.number === KREMPASKY_PRIOR_NUMBER);
      invariant(prior, "Krempasky's earlier invoice is missing.");
      const priorFields = object(prior.customFields);
      invariant(prior.status === PaymentStatus.PAID && prior.totalCents === invoice.totalCents, "Krempasky's earlier invoice or payment status changed.");
      invariant(priorFields.chargeSource === "tuitionPlan" && priorFields.billingPeriod === "2026-W31" && string(priorFields.sourceId) === string(fields.sourceId), "Krempasky's earlier tuition evidence changed.");
      invariant(sameUtcDay(prior.dueDate, scheduledChargeDate), "Krempasky's invoices no longer share the August 6 billing date.");
    } else {
      const candidates = invoice.billingAccount.invoices.filter((candidate) => {
        const priorFields = object(candidate.customFields);
        return candidate.status !== PaymentStatus.VOID
          && candidate.totalCents === invoice.totalCents
          && priorFields.chargeSource === "tuitionPlan"
          && priorFields.billingPeriod === "2026-W31"
          && string(priorFields.childId) === childId
          && sameUtcDay(candidate.dueDate, scheduledChargeDate);
      });
      invariant(candidates.length === 1, `${invoice.number} does not have exactly one same-child, same-amount, same-date earlier tuition invoice.`);
      prior = candidates[0];
    }

    const centerId = invoice.billingAccount.family.centerId;
    invariant(centerId === LONGMONT_ID || centerId === CORDERA_ID, `${invoice.number} is outside the guarded school scope.`);

    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.totalCents,
      centerId,
      familyId: invoice.billingAccount.family.id,
      familyName: invoice.billingAccount.family.name,
      billingAccountId: invoice.billingAccount.id,
      accountBalanceCents: invoice.billingAccount.balanceCents,
      priorInvoiceId: prior.id,
      priorInvoiceNumber: prior.number,
      priorInvoiceStatus: prior.status,
      draftPayments: invoice.billingAccount.payments,
      customFields: invoice.customFields,
    };
  });

  const accounts = [...new Map(resolved.map((target) => [target.billingAccountId, {
    billingAccountId: target.billingAccountId,
    familyId: target.familyId,
    familyName: target.familyName,
    centerId: target.centerId,
    balanceBeforeCents: target.accountBalanceCents,
    duplicateCents: resolved.filter((item) => item.billingAccountId === target.billingAccountId).reduce((sum, item) => sum + item.totalCents, 0),
    drafts: target.draftPayments,
  }])).values()].map((account) => ({ ...account, restoredBalanceCents: account.balanceBeforeCents - account.duplicateCents }));

  const draftPayments = [...new Map(accounts.flatMap((account) => account.drafts.map((draft) => [draft.id, { ...draft, account }]))).values()];
  invariant(draftPayments.length === 2, `Expected two Longmont draft checkouts; found ${draftPayments.length}.`);
  const draftSnapshots = [];
  for (const draft of draftPayments) {
    const fields = object(draft.customFields);
    const sessionId = string(fields.stripeCheckoutSessionId);
    const connectedAccountId = string(fields.stripeConnectedAccountId);
    const tenantId = string(fields.tenantId);
    invariant(sessionId && connectedAccountId && tenantId, `${draft.id} checkout identity is incomplete.`);
    const retrieved = await retrieveStripeCheckoutSession({ sessionId, connectedAccountId, tenantId });
    invariant(retrieved.ok && retrieved.session, `${draft.id} checkout could not be verified: ${retrieved.error ?? "unknown error"}`);
    invariant(retrieved.session.status === "open" && retrieved.session.paymentStatus === "unpaid" && !retrieved.session.paymentIntentId, `${draft.id} checkout is no longer open and unpaid.`);
    const disposition = draft.amountCents === draft.account.restoredBalanceCents ? "preserve" : "expire_superseded";
    invariant(disposition === "preserve" || draft.amountCents === draft.account.balanceBeforeCents, `${draft.id} checkout amount is unrelated to either reviewed balance.`);
    draftSnapshots.push({
      id: draft.id,
      familyName: draft.account.familyName,
      amountCents: draft.amountCents,
      restoredBalanceCents: draft.account.restoredBalanceCents,
      disposition,
      session: retrieved.session,
      connectedAccountId,
      tenantId,
      payment: draft,
    });
  }
  invariant(draftSnapshots.filter((draft) => draft.disposition === "preserve").length === 1, "Expected one preserved checkout.");
  invariant(draftSnapshots.filter((draft) => draft.disposition === "expire_superseded").length === 1, "Expected one superseded checkout.");

  const state = {
    recoveryFingerprint: RECOVERY_FINGERPRINT,
    targets: resolved.map((target) => ({ ...target, draftPayments: target.draftPayments.map((draft) => ({ id: draft.id, amountCents: draft.amountCents, status: draft.status, customFields: draft.customFields })) })),
    accounts: accounts.map((account) => ({ ...account, drafts: account.drafts.map((draft) => ({ id: draft.id, amountCents: draft.amountCents, status: draft.status, customFields: draft.customFields })) })),
    draftSnapshots: draftSnapshots.map((draft) => ({ id: draft.id, familyName: draft.familyName, amountCents: draft.amountCents, restoredBalanceCents: draft.restoredBalanceCents, disposition: draft.disposition, session: draft.session })),
  };
  return { state, fingerprint: fingerprint(state), centers, targets: resolved, accounts, draftSnapshots };
}

async function main() {
  const before = await loadState();
  console.log(JSON.stringify({
    mode: process.argv.includes(APPLY) ? "apply" : "dry-run",
    fingerprint: before.fingerprint,
    invoicesToVoid: before.targets.length,
    familiesToRestore: new Set(before.targets.map((target) => target.familyId)).size,
    duplicateCentsToRemove: before.targets.reduce((sum, target) => sum + target.totalCents, 0),
    schools: Object.entries(Object.groupBy(before.targets, (target) => target.centerId)).map(([centerId, targets]) => ({ centerId, invoices: targets?.length ?? 0, cents: targets?.reduce((sum, target) => sum + target.totalCents, 0) ?? 0 })),
    earlierInvoicesPreserved: before.targets.length,
    earlierPaidInvoicesPreserved: before.targets.filter((target) => target.priorInvoiceStatus === PaymentStatus.PAID).length,
    checkoutActions: before.draftSnapshots.map((draft) => ({ familyName: draft.familyName, amountCents: draft.amountCents, restoredBalanceCents: draft.restoredBalanceCents, disposition: draft.disposition })),
    refundsToIssue: 0,
  }, null, 2));
  if (!process.argv.includes(APPLY)) return;

  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(arg(FINGERPRINT_ARG) === before.fingerprint, "Duplicate recovery state changed; rerun the dry run.");
  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true } });
  invariant(user, "Brenden audit user was not found.");

  const supersededDraft = before.draftSnapshots.find((draft) => draft.disposition === "expire_superseded");
  invariant(supersededDraft, "Superseded checkout was not found.");
  const cleared = await resolveStripeCheckoutDraftBlocker({
    payment: supersededDraft.payment,
    connectedAccountId: supersededDraft.connectedAccountId,
    tenantId: supersededDraft.tenantId,
    scope: "family_balance",
    expectedAmountCents: supersededDraft.restoredBalanceCents,
  });
  invariant(!cleared.blocked && cleared.cleared && cleared.clearReason === "superseded_amount", "The doubled-balance checkout was not safely expired.");

  const voidedAt = new Date();
  for (const target of before.targets) {
    await prisma.$transaction(async (tx) => {
      const current = await tx.invoice.findUniqueOrThrow({
        where: { id: target.id },
        include: { ledgerEntries: { select: { amountCents: true, paymentId: true } }, billingAccount: { select: { id: true, family: { select: { id: true, centerId: true } } } } },
      });
      invariant(current.status === PaymentStatus.OPEN, `${target.number} changed before rollback.`);
      invariant(current.billingAccount.family.id === target.familyId && current.billingAccount.family.centerId === target.centerId, `${target.number} scope changed.`);
      invariant(object(current.customFields).recoveryManifestFingerprint === RECOVERY_FINGERPRINT, `${target.number} recovery evidence changed.`);
      invariant(current.ledgerEntries.every((entry) => !entry.paymentId), `${target.number} gained a payment.`);
      const reversalCents = invoiceLedgerBalanceCents(current.ledgerEntries);
      invariant(reversalCents === current.totalCents, `${target.number} ledger is no longer exactly reversible.`);
      const updated = await tx.invoice.updateMany({
        where: { id: current.id, status: PaymentStatus.OPEN },
        data: {
          status: PaymentStatus.VOID,
          customFields: {
            ...object(current.customFields),
            voidedAt: voidedAt.toISOString(),
            voidedByUserId: user.id,
            voidedByEmail: user.email,
            voidReason: REASON,
            duplicateOfInvoiceId: target.priorInvoiceId,
            duplicateOfInvoiceNumber: target.priorInvoiceNumber,
            recoveryRollbackFingerprint: before.fingerprint,
          } as Prisma.InputJsonObject,
        },
      });
      invariant(updated.count === 1, `${target.number} changed before its guarded update.`);
      const account = await tx.billingAccount.update({ where: { id: current.billingAccount.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
      const ledger = await tx.ledgerEntry.create({
        data: {
          billingAccountId: current.billingAccount.id,
          invoiceId: current.id,
          type: "invoice_void",
          description: `Voided ${current.number}: ${REASON}`,
          amountCents: -reversalCents,
          balanceAfterCents: account.balanceCents,
          sourceSystem: "bee_suite_manual",
          externalId: `invoice-void:${current.id}`,
          metadata: { reason: REASON, duplicateOfInvoiceId: target.priorInvoiceId, duplicateOfInvoiceNumber: target.priorInvoiceNumber, recoveryManifestFingerprint: RECOVERY_FINGERPRINT, recoveryRollbackFingerprint: before.fingerprint },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: before.centers.find((center) => center.id === target.centerId)?.organization.tenantId ?? user.tenantId,
          centerId: target.centerId,
          userId: user.id,
          action: "billing.invoice.voided_duplicate_recovery",
          resource: "Invoice",
          resourceId: current.id,
          metadata: { familyId: target.familyId, invoiceNumber: current.number, amountCents: reversalCents, reason: REASON, ledgerEntryId: ledger.id, duplicateOfInvoiceId: target.priorInvoiceId, duplicateOfInvoiceNumber: target.priorInvoiceNumber, recoveryManifestFingerprint: RECOVERY_FINGERPRINT, recoveryRollbackFingerprint: before.fingerprint },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
  }

  const [afterInvoices, afterAccounts, priorInvoices, afterDrafts] = await Promise.all([
    prisma.invoice.findMany({ where: { id: { in: before.targets.map((target) => target.id) } }, select: { id: true, status: true } }),
    prisma.billingAccount.findMany({ where: { id: { in: before.accounts.map((account) => account.billingAccountId) } }, select: { id: true, balanceCents: true } }),
    prisma.invoice.findMany({ where: { id: { in: before.targets.map((target) => target.priorInvoiceId) } }, select: { id: true, status: true } }),
    prisma.payment.findMany({ where: { id: { in: before.draftSnapshots.map((draft) => draft.id) } }, select: { id: true, status: true, amountCents: true, customFields: true } }),
  ]);
  invariant(afterInvoices.length === before.targets.length && afterInvoices.every((invoice) => invoice.status === PaymentStatus.VOID), "Not every duplicate recovery invoice is void.");
  for (const account of before.accounts) {
    invariant(afterAccounts.find((item) => item.id === account.billingAccountId)?.balanceCents === account.restoredBalanceCents, `${account.familyName} did not return to its pre-recovery balance.`);
  }
  for (const target of before.targets) {
    invariant(priorInvoices.find((invoice) => invoice.id === target.priorInvoiceId)?.status === target.priorInvoiceStatus, `${target.priorInvoiceNumber} changed unexpectedly.`);
  }
  const preservedDraft = before.draftSnapshots.find((draft) => draft.disposition === "preserve");
  invariant(preservedDraft && afterDrafts.find((draft) => draft.id === preservedDraft.id)?.status === PaymentStatus.DRAFT, "The matching checkout was not preserved.");
  invariant(afterDrafts.find((draft) => draft.id === supersededDraft.id)?.status === PaymentStatus.VOID, "The doubled-balance checkout draft was not voided.");
  console.log(JSON.stringify({
    ok: true,
    invoicesVoided: before.targets.length,
    familiesRestored: new Set(before.targets.map((target) => target.familyId)).size,
    duplicateCentsRemoved: TOTAL_EXPECTED_CENTS,
    earlierInvoicesPreserved: before.targets.length,
    earlierPaidInvoicesPreserved: before.targets.filter((target) => target.priorInvoiceStatus === PaymentStatus.PAID).length,
    supersededCheckoutExpired: supersededDraft.id,
    matchingCheckoutPreserved: preservedDraft.id,
    refundsIssued: 0,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
