import "./load-env";

import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const APPLY_FLAG = "--apply";
const CONFIRM_FLAG = "--confirm-fingerprint";
const LONGMONT_CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const LONGMONT_CENTER_NAME = "Kid City USA - Longmont";
const EYRICH_FAMILY_ID = "cmq9wiah20144k10azuzeq7do";
const EYRICH_ACCOUNT_ID = "cmq9wiaw5014ak10aix88yczn";
const EYRICH_AMOUNT_CENTS = 10_000;
const EYRICH_REPORTED_AT = new Date("2026-08-21T16:11:15.000Z");
const EYRICH_EMAIL_THREAD_ID = "1a025177172b2e66";
const EYRICH_PAYMENT_EXTERNAL_ID = `cash:email-thread:${EYRICH_EMAIL_THREAD_ID}`;
const EYRICH_LEDGER_EXTERNAL_ID = `longmont-email-cash:${EYRICH_EMAIL_THREAD_ID}`;

const PISGAH_CENTER_ID = "cmp4ewg8w004k6alwid0bwiur";
const PISGAH_CENTER_NAME = "Kid City USA - Pisgah Forest";
const LEXI_STAFF_PROFILE_ID = "cms3r4oxf00156av8t8s03qgf";
const LEXI_STAFF_USER_EMAIL = "lexi.jones@thebeesuite.io";
const LEXI_GUARDIAN_EMAIL = "lexijones2004@gmail.com";
const LEXI_EMAIL_THREAD_ID = "1a03559611f22e0d";
const LEXI_EMPLOYMENT_ENDED_AT = "2026-08-24T19:57:09.000Z";

function record(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function loadState(db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [longmont, eyrichAccount, existingPayment, existingLedger, pisgah, lexiStaff, lexiGuardianUser] = await Promise.all([
    db.center.findUnique({ where: { id: LONGMONT_CENTER_ID }, select: { id: true, name: true, organization: { select: { tenantId: true } } } }),
    db.billingAccount.findUnique({ where: { id: EYRICH_ACCOUNT_ID }, select: { id: true, familyId: true, balanceCents: true } }),
    db.payment.findFirst({ where: { billingAccountId: EYRICH_ACCOUNT_ID, externalIdPlaceholder: EYRICH_PAYMENT_EXTERNAL_ID }, select: { id: true, amountCents: true, status: true } }),
    db.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "bee_suite_manual_cash", externalId: EYRICH_LEDGER_EXTERNAL_ID } }, select: { id: true, amountCents: true, paymentId: true } }),
    db.center.findUnique({ where: { id: PISGAH_CENTER_ID }, select: { id: true, name: true, organization: { select: { tenantId: true } } } }),
    db.staffProfile.findUnique({ where: { id: LEXI_STAFF_PROFILE_ID }, select: { id: true, centerId: true, customFields: true, user: { select: { id: true, email: true, isActive: true, sessionVersion: true, customFields: true } } } }),
    db.user.findUnique({ where: { email: LEXI_GUARDIAN_EMAIL }, select: { id: true, email: true, isActive: true, guardians: { where: { family: { centerId: PISGAH_CENTER_ID } }, select: { family: { select: { id: true, children: { select: { id: true, enrollmentStatus: true, classroomId: true, customFields: true } } } } } } } }),
  ]);

  invariant(longmont?.name === LONGMONT_CENTER_NAME, "Longmont center identity changed.");
  invariant(eyrichAccount?.familyId === EYRICH_FAMILY_ID, "Eyrich billing account identity changed.");
  invariant(pisgah?.name === PISGAH_CENTER_NAME, "Pisgah Forest center identity changed.");
  invariant(lexiStaff?.centerId === PISGAH_CENTER_ID && lexiStaff.user.email === LEXI_STAFF_USER_EMAIL, "Lexi staff identity changed.");
  invariant(lexiGuardianUser?.guardians.length === 1, "Lexi's separate guardian identity or family scope changed.");
  const children = lexiGuardianUser.guardians[0].family.children;
  invariant(children.length === 3, "Expected the three Rhinehart children in Lexi's family.");
  invariant(children.every((child) => ["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase()) && child.classroomId), "Every Rhinehart child must remain currently enrolled.");

  return { longmont, eyrichAccount, existingPayment, existingLedger, pisgah, lexiStaff, lexiGuardianUser, children };
}

function reviewedState(state: Awaited<ReturnType<typeof loadState>>) {
  return {
    eyrich: {
      accountId: state.eyrichAccount.id,
      familyId: state.eyrichAccount.familyId,
      balanceCents: state.eyrichAccount.balanceCents,
      existingPaymentId: state.existingPayment?.id ?? null,
      existingLedgerId: state.existingLedger?.id ?? null,
    },
    lexi: {
      staffProfileId: state.lexiStaff.id,
      staffUserId: state.lexiStaff.user.id,
      staffUserActive: state.lexiStaff.user.isActive,
      guardianUserId: state.lexiGuardianUser.id,
      guardianUserActive: state.lexiGuardianUser.isActive,
      childIds: state.children.map((child) => child.id).sort(),
    },
  };
}

async function main() {
  const before = await loadState();
  const reviewed = reviewedState(before);
  const planFingerprint = fingerprint(reviewed);
  const alreadyApplied = Boolean(before.existingPayment && before.existingLedger && !before.lexiStaff.user.isActive);
  if (!process.argv.includes(APPLY_FLAG)) {
    console.log(JSON.stringify({ mode: "preview", alreadyApplied, planFingerprint, reviewed, planned: {
      eyrichCashPaymentCents: before.existingPayment ? 0 : EYRICH_AMOUNT_CENTS,
      lexiStaffDeactivation: before.lexiStaff.user.isActive,
      guardianAccessChanged: false,
      childEnrollmentChanged: false,
      childTuitionChanged: false,
      chargesCreated: 0,
      refundsCreated: 0,
    } }, null, 2));
    return;
  }
  invariant(option(CONFIRM_FLAG) === planFingerprint, `Pass ${CONFIRM_FLAG} ${planFingerprint} after reviewing the current preview.`);

  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    invariant(fingerprint(reviewedState(current)) === planFingerprint, "Production state changed after preview; no correction was applied.");

    if (!current.existingPayment && !current.existingLedger) {
      invariant(current.eyrichAccount.balanceCents === 35_800, "Eyrich balance changed from the reviewed $358.00 state.");
      const payment = await tx.payment.create({ data: {
        billingAccountId: EYRICH_ACCOUNT_ID,
        amountCents: EYRICH_AMOUNT_CENTS,
        status: PaymentStatus.PAID,
        provider: "manual_cash",
        externalIdPlaceholder: EYRICH_PAYMENT_EXTERNAL_ID,
        paidAt: EYRICH_REPORTED_AT,
        customFields: {
          paymentType: "manual_cash",
          reference: `Longmont email thread ${EYRICH_EMAIL_THREAD_ID}`,
          notes: "Director reported $100 cash for the Eyrich family; effective timestamp is the report timestamp because the receipt date was not supplied.",
          sourceEvidence: "director_email",
          sourceThreadId: EYRICH_EMAIL_THREAD_ID,
          actualReceiptDateConfirmed: false,
          familyId: EYRICH_FAMILY_ID,
          centerId: LONGMONT_CENTER_ID,
        },
      } });
      const account = await tx.billingAccount.update({ where: { id: EYRICH_ACCOUNT_ID }, data: { balanceCents: { decrement: EYRICH_AMOUNT_CENTS } } });
      await tx.ledgerEntry.create({ data: {
        billingAccountId: EYRICH_ACCOUNT_ID,
        paymentId: payment.id,
        type: "cash_payment",
        description: "Cash payment reported by Longmont director",
        amountCents: -EYRICH_AMOUNT_CENTS,
        balanceAfterCents: account.balanceCents,
        effectiveAt: EYRICH_REPORTED_AT,
        sourceSystem: "bee_suite_manual_cash",
        externalId: EYRICH_LEDGER_EXTERNAL_ID,
        metadata: { sourceEvidence: "director_email", sourceThreadId: EYRICH_EMAIL_THREAD_ID, actualReceiptDateConfirmed: false },
      } });
      await tx.auditLog.create({ data: {
        tenantId: current.longmont.organization.tenantId,
        centerId: LONGMONT_CENTER_ID,
        action: "billing.cash_payment.email_reconciled",
        resource: "Payment",
        resourceId: payment.id,
        metadata: { familyId: EYRICH_FAMILY_ID, amountCents: EYRICH_AMOUNT_CENTS, sourceThreadId: EYRICH_EMAIL_THREAD_ID, actualReceiptDateConfirmed: false, invoiceStatusesChanged: false, chargeCreated: false, refundCreated: false },
      } });
    } else {
      invariant(Boolean(current.existingPayment && current.existingLedger), "Only part of the Eyrich correction exists; manual review is required.");
      invariant(current.existingPayment?.amountCents === EYRICH_AMOUNT_CENTS && current.existingPayment.status === PaymentStatus.PAID && current.existingLedger?.amountCents === -EYRICH_AMOUNT_CENTS, "Existing Eyrich correction does not match the reviewed payment.");
    }

    if (current.lexiStaff.user.isActive) {
      const staffFields = record(current.lexiStaff.customFields);
      const userFields = record(current.lexiStaff.user.customFields);
      await tx.user.update({ where: { id: current.lexiStaff.user.id }, data: {
        isActive: false,
        sessionVersion: { increment: 1 },
        customFields: { ...userFields, employmentStatus: "inactive", employmentEndedAt: LEXI_EMPLOYMENT_ENDED_AT, employmentEvidenceThreadId: LEXI_EMAIL_THREAD_ID },
      } });
      await tx.staffProfile.update({ where: { id: current.lexiStaff.id }, data: {
        customFields: { ...staffFields, employmentStatus: "inactive", employmentEndedAt: LEXI_EMPLOYMENT_ENDED_AT, employmentEvidenceThreadId: LEXI_EMAIL_THREAD_ID },
      } });
      await tx.auditLog.create({ data: {
        tenantId: current.pisgah.organization.tenantId,
        centerId: PISGAH_CENTER_ID,
        action: "operations.staff.employment_ended",
        resource: "StaffProfile",
        resourceId: current.lexiStaff.id,
        metadata: { staffUserId: current.lexiStaff.user.id, sourceThreadId: LEXI_EMAIL_THREAD_ID, effectiveAt: LEXI_EMPLOYMENT_ENDED_AT, guardianUserId: current.lexiGuardianUser.id, guardianAccessChanged: false, childIds: current.children.map((child) => child.id), childEnrollmentChanged: false, childTuitionChanged: false },
      } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });

  const after = await loadState();
  invariant(after.existingPayment?.amountCents === EYRICH_AMOUNT_CENTS && after.existingLedger?.amountCents === -EYRICH_AMOUNT_CENTS, "Eyrich payment did not post exactly once.");
  invariant(after.eyrichAccount.balanceCents === before.eyrichAccount.balanceCents - (before.existingPayment ? 0 : EYRICH_AMOUNT_CENTS), "Eyrich post-balance is not the reviewed amount.");
  invariant(!after.lexiStaff.user.isActive, "Lexi's staff identity remains active.");
  invariant(after.lexiGuardianUser.isActive && after.children.every((child) => ["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase()) && child.classroomId), "Lexi's guardian access or the Rhinehart enrollment changed.");
  console.log(JSON.stringify({ mode: "applied", eyrichPaymentId: after.existingPayment.id, eyrichBalanceCents: after.eyrichAccount.balanceCents, lexiStaffActive: after.lexiStaff.user.isActive, guardianAccessPreserved: after.lexiGuardianUser.isActive, enrolledChildrenPreserved: after.children.length, chargesCreated: 0, refundsCreated: 0 }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => prisma.$disconnect());
