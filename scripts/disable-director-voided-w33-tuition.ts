import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CHILD_ID = "cmrwa7wyk030cjr04xr89h1fr";
const FAMILY_ID = "cmrwa7wn30308jr04xk2ij1cz";
const CENTER_ID = "cmp4ew5yx00046alw8i1yf63m";
const PERIOD = "2026-W33";
const APPLY = "--apply";
const CONFIRM = "--confirm-director-void";
const FP = "--confirm-fingerprint=";

function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function arg(prefix: string) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim();
}

async function state() {
  const child = await prisma.child.findUnique({
    where: { id: CHILD_ID },
    select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, customFields: true, family: { select: { centerId: true, name: true, billingAccount: { select: { id: true, balanceCents: true, customFields: true } } } } },
  });
  invariant(child && child.familyId === FAMILY_ID && child.family.centerId === CENTER_ID, "Ivaan Shrestha identity or family scope changed.");
  const voidInvoice = await prisma.invoice.findFirst({
    where: { billingAccount: { familyId: FAMILY_ID }, status: PaymentStatus.VOID, customFields: { path: ["childId"], equals: CHILD_ID } },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, totalCents: true, customFields: true },
  });
  invariant(voidInvoice && object(voidInvoice.customFields).billingPeriod === PERIOD && object(voidInvoice.customFields).voidReason === "No longer enrolled", "Director void evidence changed or is missing.");
  const nonVoid = await prisma.invoice.count({
    where: { billingAccount: { familyId: FAMILY_ID }, status: { not: PaymentStatus.VOID }, customFields: { path: ["childId"], equals: CHILD_ID } },
  });
  invariant(nonVoid === 0, "A non-void invoice now exists for Ivaan Shrestha.");
  const otherEnabled = await prisma.child.count({
    where: { familyId: FAMILY_ID, id: { not: CHILD_ID }, customFields: { path: ["tuitionBillingEnabled"], equals: true } },
  });
  invariant(otherEnabled === 0, "Another enabled tuition child now shares the Shretha billing account.");
  const snapshot = { child, voidInvoice, nonVoid, otherEnabled };
  return { snapshot, fingerprint: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

async function main() {
  const before = await state();
  const apply = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", fingerprint: before.fingerprint, child: before.snapshot.child.fullName, family: before.snapshot.child.family.name, balanceCents: before.snapshot.child.family.billingAccount?.balanceCents, voidInvoice: before.snapshot.voidInvoice.number, voidReason: object(before.snapshot.voidInvoice.customFields).voidReason }, null, 2));
  if (!apply) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  invariant(arg(FP) === before.fingerprint, "Director void state changed; rerun the dry run.");
  const user = await prisma.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true } });
  invariant(user, "Brenden audit user was not found.");

  await prisma.$transaction(async (tx) => {
    const childFields = object(before.snapshot.child.customFields);
    const updatedAt = new Date().toISOString();
    await tx.child.update({
      where: { id: CHILD_ID },
      data: { customFields: {
        ...childFields,
        tuitionBillingEnabled: false,
        tuitionAutobillEligible: false,
        tuitionBillingUpdatedAt: updatedAt,
        tuitionBillingUpdatedBy: "Brenden Bruner - honored director W33 void 2026-08-07",
        tuitionBillingHoldReason: "Director voided W33 invoice: No longer enrolled",
      } as Prisma.InputJsonObject },
    });
    const account = before.snapshot.child.family.billingAccount;
    if (account) {
      await tx.billingAccount.update({
        where: { id: account.id },
        data: { customFields: { ...object(account.customFields), tuitionAutobillEnabled: false, tuitionAutobillUpdatedAt: updatedAt, tuitionAutobillUpdatedBy: "Brenden Bruner - honored director W33 void 2026-08-07" } as Prisma.InputJsonObject },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: user.tenantId,
        centerId: CENTER_ID,
        userId: user.id,
        action: "billing.tuition_assignment.disabled_after_director_void",
        resource: "Child",
        resourceId: CHILD_ID,
        metadata: { familyId: FAMILY_ID, childId: CHILD_ID, billingPeriod: PERIOD, voidInvoiceId: before.snapshot.voidInvoice.id, voidInvoiceNumber: before.snapshot.voidInvoice.number, voidReason: "No longer enrolled", noPaymentSubmitted: true },
      },
    });
  });
  console.log(JSON.stringify({ ok: true, disabled: true, balanceChanged: false, paymentSubmitted: false }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
