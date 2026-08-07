import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const CENTER_NAME = "Kid City USA - Granbury";
const PERIOD = "2026-W33";
const APPLY = "--apply";
const CONFIRM = "--confirm-granbury-director-followup";
const FINGERPRINT = "--confirm-fingerprint=";
const MATEO_FAMILY = "Loving Household";
const MATEO_CHILD = "Mateo Thorin Lovin-Luna";
const EZRA_FAMILY = "Gonzalez Family";
const APPROVED_EZRA_INVOICE_CENTS = 10_500;
const MATEO_INCORRECT_INVOICE_CENTS = 41_000;

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function argument(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

function isCurrent(status: string) {
  return ["enrolled", "active", "current"].includes(status.trim().toLowerCase());
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const center = await client.center.findFirst({
    where: { name: CENTER_NAME, status: { not: "closed" } },
    select: { id: true, name: true, status: true },
  });
  invariant(center, "Active Granbury center was not found.");

  const families = await client.family.findMany({
    where: { centerId: center.id, name: { in: [MATEO_FAMILY, EZRA_FAMILY] } },
    select: {
      id: true,
      name: true,
      children: {
        select: { id: true, fullName: true, dateOfBirth: true, enrollmentStatus: true, classroomId: true, customFields: true },
        orderBy: { fullName: "asc" },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          customFields: true,
          payments: {
            select: { id: true, status: true, amountCents: true, provider: true, customFields: true },
            orderBy: { id: "asc" },
          },
          ledgerEntries: {
            select: { id: true, type: true, description: true, amountCents: true, balanceAfterCents: true, effectiveAt: true, createdAt: true, invoiceId: true, paymentId: true, externalId: true, metadata: true },
            orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
          },
          invoices: {
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
              ledgerEntries: {
                select: { id: true, type: true, amountCents: true, balanceAfterCents: true, paymentId: true, externalId: true },
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  invariant(families.length === 2, `Expected two Granbury target families; found ${families.length}.`);

  const mateoFamily = families.find((family) => family.name === MATEO_FAMILY);
  const ezraFamily = families.find((family) => family.name === EZRA_FAMILY);
  invariant(mateoFamily?.billingAccount, "Mateo family billing account was not found.");
  invariant(ezraFamily?.billingAccount, "Ezra family billing account was not found.");

  const mateo = mateoFamily.children.find((child) => child.fullName === MATEO_CHILD);
  invariant(mateo && isCurrent(mateo.enrollmentStatus), "Mateo current child identity changed.");
  const mateoInvoices = mateoFamily.billingAccount.invoices.filter((invoice) => {
    const fields = object(invoice.customFields);
    return fields.childId === mateo.id && (fields.billingPeriod === PERIOD || fields.coverageStartsPeriod === PERIOD);
  });
  invariant(mateoInvoices.length === 1, `Expected one Mateo ${PERIOD} invoice; found ${mateoInvoices.length}.`);
  const mateoInvoice = mateoInvoices[0];
  invariant(mateoInvoice.status === PaymentStatus.OPEN && mateoInvoice.totalCents === MATEO_INCORRECT_INVOICE_CENTS, "Mateo invoice is no longer the director-confirmed open $410 charge.");
  const blocker = invoiceVoidBlocker({ ...mateoInvoice, payments: mateoFamily.billingAccount.payments });
  invariant(!blocker, `Mateo invoice cannot be safely voided: ${blocker}`);
  invariant(mateoFamily.billingAccount.balanceCents === 0, `Mateo account balance changed from the reviewed $0 state to ${mateoFamily.billingAccount.balanceCents} cents.`);
  invariant(mateoFamily.billingAccount.payments.length === 0, "Mateo account now has payment records that require separate review.");
  const directorCorrectionEntries = mateoFamily.billingAccount.ledgerEntries.filter((entry) => {
    const metadata = object(entry.metadata);
    return entry.type === "credit"
      && entry.amountCents === -70_000
      && metadata.enteredBy === "granbury1@kidcityusa.com"
      && entry.description.includes("Wrong amount Inputted from Procare");
  });
  invariant(directorCorrectionEntries.length === 1, `Expected one reviewed Granbury $700 correction; found ${directorCorrectionEntries.length}.`);
  const directorCorrection = directorCorrectionEntries[0];
  const checkEntries = mateoFamily.billingAccount.ledgerEntries.filter((entry) => entry.type === "credit" && entry.amountCents === -12_000 && entry.description === "Pmt By Check");
  invariant(checkEntries.length === 1, `Expected one preserved $120 check entry; found ${checkEntries.length}.`);

  const ezraCurrent = ezraFamily.children.filter((child) => isCurrent(child.enrollmentStatus));
  invariant(ezraCurrent.length === 2, `Expected two current Ezra profiles; found ${ezraCurrent.length}.`);
  invariant(ezraCurrent.every((child) => /ezra/i.test(child.fullName)), "Unexpected non-Ezra child found in duplicate set.");
  const approvedEzraCandidates = ezraCurrent.filter((child) => ezraFamily.billingAccount!.invoices.some((invoice) => {
    const fields = object(invoice.customFields);
    return invoice.status !== PaymentStatus.VOID
      && invoice.totalCents === APPROVED_EZRA_INVOICE_CENTS
      && fields.childId === child.id
      && (fields.billingPeriod === PERIOD || fields.coverageStartsPeriod === PERIOD);
  }));
  invariant(approvedEzraCandidates.length === 1, `Expected one Ezra profile with the approved $105 ${PERIOD} invoice; found ${approvedEzraCandidates.length}.`);
  const approvedEzra = approvedEzraCandidates[0];
  const duplicateEzra = ezraCurrent.find((child) => child.id !== approvedEzra.id);
  invariant(duplicateEzra, "Duplicate Ezra profile was not found.");
  invariant(!ezraFamily.billingAccount.invoices.some((invoice) => invoice.status !== PaymentStatus.VOID && object(invoice.customFields).childId === duplicateEzra.id), "Duplicate Ezra profile now has an active invoice.");
  invariant(
    approvedEzra.dateOfBirth?.toISOString().slice(0, 10) === duplicateEzra.dateOfBirth?.toISOString().slice(0, 10),
    `Ezra duplicate birth dates do not match (${approvedEzra.fullName}: ${approvedEzra.dateOfBirth?.toISOString() || "missing"}; ${duplicateEzra.fullName}: ${duplicateEzra.dateOfBirth?.toISOString() || "missing"}).`,
  );

  const snapshot = {
    center,
    mateoFamily,
    mateo,
    mateoInvoice,
    directorCorrection,
    approvedEzra,
    duplicateEzra,
    ezraFamily,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
  return { snapshot, fingerprint };
}

async function applyRepair(expectedFingerprint: string) {
  const user = await prisma.user.findUnique({
    where: { email: "brenden@kidcityusa.com" },
    select: { id: true, tenantId: true, email: true },
  });
  invariant(user, "Brenden application user was not found for audit attribution.");

  return prisma.$transaction(async (tx) => {
    const before = await loadState(tx);
    invariant(before.fingerprint === expectedFingerprint, "Granbury state changed; rerun the dry run and review the new fingerprint.");
    const { center, mateoFamily, mateo, mateoInvoice, directorCorrection, approvedEzra, duplicateEzra, ezraFamily } = before.snapshot;
    invariant(mateoFamily.billingAccount && ezraFamily.billingAccount, "Target billing account disappeared.");

    const voidedAt = new Date();
    const reason = "Director confirmed Mateo is $50 daily drop-in only when attending; recurring W33 $410 invoice was incorrect.";
    const reversalCents = invoiceLedgerBalanceCents(mateoInvoice.ledgerEntries);
    invariant(reversalCents === MATEO_INCORRECT_INVOICE_CENTS, "Mateo invoice ledger no longer totals $410.");
    const updated = await tx.invoice.updateMany({
      where: { id: mateoInvoice.id, status: PaymentStatus.OPEN },
      data: {
        status: PaymentStatus.VOID,
        customFields: {
          ...object(mateoInvoice.customFields),
          voidedAt: voidedAt.toISOString(),
          voidedByUserId: user.id,
          voidedByEmail: user.email,
          voidReason: reason,
          directorConfirmation: "Granbury Reply All 2026-08-07",
        } as Prisma.InputJsonObject,
      },
    });
    invariant(updated.count === 1, "Mateo invoice changed before it could be voided.");

    const accountAfterVoid = await tx.billingAccount.update({
      where: { id: mateoFamily.billingAccount.id },
      data: { balanceCents: { decrement: reversalCents } },
      select: { balanceCents: true, customFields: true },
    });
    const voidLedger = await tx.ledgerEntry.create({
      data: {
        billingAccountId: mateoFamily.billingAccount.id,
        invoiceId: mateoInvoice.id,
        type: "invoice_void",
        description: `Voided ${mateoInvoice.number}: ${reason}`,
        amountCents: -reversalCents,
        balanceAfterCents: accountAfterVoid.balanceCents,
        sourceSystem: "bee_suite_manual",
        externalId: `invoice-void:${mateoInvoice.id}`,
        metadata: {
          voidedBy: user.email,
          reason,
          previousStatus: PaymentStatus.OPEN,
          updatedStatus: PaymentStatus.VOID,
          directorConfirmation: "Granbury Reply All 2026-08-07",
          noPaymentSubmitted: true,
        },
      },
    });
    const balancedAccount = await tx.billingAccount.update({
      where: { id: mateoFamily.billingAccount.id },
      data: { balanceCents: { increment: reversalCents } },
      select: { balanceCents: true },
    });
    const correctionReversalLedger = await tx.ledgerEntry.create({
      data: {
        billingAccountId: mateoFamily.billingAccount.id,
        type: "credit_reversal",
        description: `Reversed $410.00 of prior Granbury correction after voiding ${mateoInvoice.number}; preserves historical W32 drop-in/check activity`,
        amountCents: reversalCents,
        balanceAfterCents: balancedAccount.balanceCents,
        sourceSystem: "bee_suite_manual",
        externalId: `granbury-credit-reversal:${mateoInvoice.id}`,
        metadata: {
          originalCreditLedgerEntryId: directorCorrection.id,
          originalCreditCents: directorCorrection.amountCents,
          reversedCreditCents: reversalCents,
          voidedInvoiceId: mateoInvoice.id,
          voidedInvoiceNumber: mateoInvoice.number,
          directorConfirmation: "Granbury Reply All 2026-08-07",
          preservedHistoricalPeriod: "2026-W32",
          preservedCheckEntryCents: 12_000,
          noPaymentSubmitted: true,
        },
      },
    });
    invariant(balancedAccount.balanceCents === mateoFamily.billingAccount.balanceCents, "Coordinated Granbury correction did not preserve Mateo's reviewed account balance.");

    const mateoFields = object(mateo.customFields);
    await tx.child.update({
      where: { id: mateo.id },
      data: {
        customFields: {
          ...mateoFields,
          tuitionBillingEnabled: false,
          tuitionAutobillEligible: false,
          tuitionBillingHoldReason: "Drop-in daily rate of $50 only when attending; no recurring weekly invoice.",
          tuitionBillingUpdatedAt: voidedAt.toISOString(),
          tuitionBillingUpdatedBy: "Brenden Bruner - Granbury director follow-up 2026-08-07",
          tuitionRateEvidence: {
            source: "director_reply",
            confirmedAt: voidedAt.toISOString(),
            note: "Granbury director confirmed Mateo is drop-in at $50 daily only when attending.",
          },
        } as Prisma.InputJsonObject,
      },
    });
    const otherEnabledMateoFamilyChildren = await tx.child.count({
      where: {
        familyId: mateoFamily.id,
        id: { not: mateo.id },
        customFields: { path: ["tuitionBillingEnabled"], equals: true },
      },
    });
    if (otherEnabledMateoFamilyChildren === 0) {
      await tx.billingAccount.update({
        where: { id: mateoFamily.billingAccount.id },
        data: {
          customFields: {
            ...object(accountAfterVoid.customFields),
            tuitionAutobillEnabled: false,
            tuitionAutobillUpdatedAt: voidedAt.toISOString(),
            tuitionAutobillUpdatedBy: "Brenden Bruner - Granbury director follow-up 2026-08-07",
          } as Prisma.InputJsonObject,
        },
      });
    }

    await tx.child.update({
      where: { id: duplicateEzra.id },
      data: {
        enrollmentStatus: "withdrawn",
        classroomId: null,
        customFields: {
          ...object(duplicateEzra.customFields),
          duplicateProfileHold: true,
          duplicateOfChildId: approvedEzra.id,
          duplicateProfileConfirmedAt: voidedAt.toISOString(),
          duplicateProfileConfirmedBy: "Granbury director Reply All 2026-08-07",
          tuitionBillingEnabled: false,
          tuitionAutobillEligible: false,
          tuitionBillingHoldReason: "Duplicate profile; director confirmed the Ezra profile with the $105 W33 balance is correct.",
        } as Prisma.InputJsonObject,
      },
    });

    await tx.auditLog.createMany({
      data: [
        {
          tenantId: user.tenantId,
          centerId: center.id,
          userId: user.id,
          action: "billing.invoice.voided",
          resource: "Invoice",
          resourceId: mateoInvoice.id,
          metadata: { familyId: mateoFamily.id, invoiceNumber: mateoInvoice.number, amountCents: reversalCents, reason, ledgerEntryId: voidLedger.id, coordinatedCreditReversalLedgerEntryId: correctionReversalLedger.id, directorConfirmation: "Granbury Reply All 2026-08-07" },
        },
        {
          tenantId: user.tenantId,
          centerId: center.id,
          userId: user.id,
          action: "billing.tuition_assignment.director_drop_in_hold",
          resource: "Child",
          resourceId: mateo.id,
          metadata: { familyId: mateoFamily.id, childId: mateo.id, dailyDropInCents: 5_000, recurringBillingDisabled: true, noPaymentSubmitted: true },
        },
        {
          tenantId: user.tenantId,
          centerId: center.id,
          userId: user.id,
          action: "child.duplicate_profile.director_confirmed",
          resource: "Child",
          resourceId: duplicateEzra.id,
          metadata: { familyId: ezraFamily.id, duplicateChildId: duplicateEzra.id, retainedChildId: approvedEzra.id, retainedW33InvoiceCents: APPROVED_EZRA_INVOICE_CENTS, balancesChanged: false },
        },
      ],
    });

    return {
      mateoInvoice: mateoInvoice.number,
      reversedCents: reversalCents,
      mateoBalanceBeforeCents: mateoFamily.billingAccount.balanceCents,
      mateoBalanceAfterCents: balancedAccount.balanceCents,
      retainedEzra: approvedEzra.fullName,
      heldDuplicateEzra: duplicateEzra.fullName,
      retainedEzraInvoiceCents: APPROVED_EZRA_INVOICE_CENTS,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

async function verify(result?: Awaited<ReturnType<typeof applyRepair>>) {
  const center = await prisma.center.findFirstOrThrow({ where: { name: CENTER_NAME, status: { not: "closed" } }, select: { id: true } });
  const families = await prisma.family.findMany({
    where: { centerId: center.id, name: { in: [MATEO_FAMILY, EZRA_FAMILY] } },
    select: {
      name: true,
      children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true } },
      billingAccount: {
        select: {
          balanceCents: true,
          payments: { select: { id: true, status: true, amountCents: true } },
          invoices: { select: { id: true, number: true, status: true, totalCents: true, customFields: true, ledgerEntries: { select: { type: true, amountCents: true, balanceAfterCents: true } } } },
          ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { balanceAfterCents: true } },
        },
      },
    },
  });
  const mateoFamily = families.find((family) => family.name === MATEO_FAMILY);
  const ezraFamily = families.find((family) => family.name === EZRA_FAMILY);
  invariant(mateoFamily?.billingAccount && ezraFamily?.billingAccount, "Verification families or accounts were not found.");
  const mateo = mateoFamily.children.find((child) => child.fullName === MATEO_CHILD);
  invariant(mateo && object(mateo.customFields).tuitionBillingEnabled === false, "Mateo recurring tuition was not disabled.");
  const mateoW33 = mateoFamily.billingAccount.invoices.filter((invoice) => object(invoice.customFields).childId === mateo.id && (object(invoice.customFields).billingPeriod === PERIOD || object(invoice.customFields).coverageStartsPeriod === PERIOD));
  invariant(mateoW33.length === 1 && mateoW33[0].status === PaymentStatus.VOID && mateoW33[0].totalCents === MATEO_INCORRECT_INVOICE_CENTS, "Mateo W33 invoice was not safely voided.");
  invariant(mateoW33[0].ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0) === 0, "Mateo voided invoice ledger does not net to zero.");
  invariant(mateoFamily.billingAccount.ledgerEntries[0]?.balanceAfterCents === mateoFamily.billingAccount.balanceCents, "Mateo account balance does not match the latest ledger balance.");
  if (result) invariant(mateoFamily.billingAccount.balanceCents === result.mateoBalanceAfterCents, "Mateo final balance changed after apply.");

  const currentEzras = ezraFamily.children.filter((child) => isCurrent(child.enrollmentStatus));
  invariant(currentEzras.length === 1 && /ezra/i.test(currentEzras[0].fullName), "Exactly one current Ezra profile was not retained.");
  const retainedEzraInvoice = ezraFamily.billingAccount.invoices.find((invoice) => invoice.status !== PaymentStatus.VOID && invoice.totalCents === APPROVED_EZRA_INVOICE_CENTS && object(invoice.customFields).childId === currentEzras[0].id && (object(invoice.customFields).billingPeriod === PERIOD || object(invoice.customFields).coverageStartsPeriod === PERIOD));
  invariant(retainedEzraInvoice, "The approved Ezra $105 W33 invoice was not retained.");
  invariant(ezraFamily.billingAccount.ledgerEntries[0]?.balanceAfterCents === ezraFamily.billingAccount.balanceCents, "Ezra account balance does not match the latest ledger balance.");

  return {
    mateo: {
      invoice: mateoW33[0].number,
      invoiceStatus: mateoW33[0].status,
      recurringWeeklyBillingEnabled: object(mateo.customFields).tuitionBillingEnabled,
      balanceCents: mateoFamily.billingAccount.balanceCents,
      latestLedgerBalanceCents: mateoFamily.billingAccount.ledgerEntries[0]?.balanceAfterCents,
    },
    ezra: {
      retainedProfile: currentEzras[0].fullName,
      retainedInvoice: retainedEzraInvoice.number,
      retainedInvoiceCents: retainedEzraInvoice.totalCents,
      duplicateProfilesCurrent: ezraFamily.children.filter((child) => child.id !== currentEzras[0].id && /ezra/i.test(child.fullName) && isCurrent(child.enrollmentStatus)).length,
      balanceCents: ezraFamily.billingAccount.balanceCents,
      latestLedgerBalanceCents: ezraFamily.billingAccount.ledgerEntries[0]?.balanceAfterCents,
    },
    paymentsSubmitted: 0,
  };
}

async function main() {
  const apply = process.argv.includes(APPLY);
  if (!apply) {
    const state = await loadState();
    const { mateoFamily, mateoInvoice, approvedEzra, duplicateEzra, ezraFamily } = state.snapshot;
    console.log(JSON.stringify({
      mode: "dry-run",
      fingerprint: state.fingerprint,
      granbury: {
        mateo: {
          family: mateoFamily.name,
          invoice: mateoInvoice.number,
          invoiceCents: mateoInvoice.totalCents,
          accountBalanceCents: mateoFamily.billingAccount?.balanceCents,
          ledgerCents: invoiceLedgerBalanceCents(mateoInvoice.ledgerEntries),
          paymentCount: mateoFamily.billingAccount?.payments.length,
          accountLedger: mateoFamily.billingAccount?.ledgerEntries.map(({ type, description, amountCents, balanceAfterCents, effectiveAt, invoiceId, paymentId, externalId, metadata }) => ({ type, description, amountCents, balanceAfterCents, effectiveAt, invoiceId, paymentId, externalId, metadata })),
          action: "void incorrect W33 invoice, reverse the matching $410 portion of the prior $700 correction to preserve the $0 balance and historical W32/check activity, and disable recurring weekly billing",
        },
        ezra: {
          family: ezraFamily.name,
          retainedProfile: approvedEzra.fullName,
          duplicateProfileToHold: duplicateEzra.fullName,
          approvedW33InvoiceCents: APPROVED_EZRA_INVOICE_CENTS,
          action: "retain approved profile and $105 invoice; move duplicate profile out of current enrollment",
        },
      },
    }, null, 2));
    return;
  }

  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = argument(FINGERPRINT);
  invariant(expectedFingerprint, `Apply requires ${FINGERPRINT}<value>.`);
  const result = await applyRepair(expectedFingerprint);
  const verification = await verify(result);
  console.log(JSON.stringify({ ok: true, result, verification }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
