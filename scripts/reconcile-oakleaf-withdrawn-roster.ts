import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PaymentStatus, Prisma } from "@prisma/client";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";
import { disableParentPortalLoginForGuardian } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { parseRenderedProcareBalanceRows } from "@/lib/procare-rendered-report-import";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-withdrawn-roster";
const FINGERPRINT = "--confirm-fingerprint=";
const EVIDENCE = "Oakleaf Account Balance Summary as of 2026-08-02: source row marked w/Hidden";

const targets = [
  { familyId: "cms67hz6s001o6a40ii0b83mm", familyName: "Abigail Brown Family", accountKey: "BRADSHAW", payerName: "Brown, Abigail", openingBalanceCents: 0, children: [{ id: "cms67i08h001u6a40lpzgwizp", name: "Kyomi Bradshaw" }] },
  { familyId: "cmsnpr9tg000yjl04tjw8q3s9", familyName: "Barnhart Family", accountKey: "BARNHART", payerName: "Barnhart, Mariah", openingBalanceCents: 0, children: [{ id: "cmsnpraaf0012jl04zpc72cai", name: "Riley Barnhart" }], compensatePreparedParentAccess: true },
  { familyId: "cms67i208001z6a40v7xbbqwk", familyName: "Bernadette Mckenzie Family", accountKey: "BROWN", payerName: "Mckenzie, Bernadette", openingBalanceCents: 751_715, children: [{ id: "cms67i31w00276a40er917jjr", name: "Noah Brown" }] },
  { familyId: "cms67ihlm003p6a4029e93mut", familyName: "Chelsia Kirksey Family", accountKey: "COFFER", payerName: "Kirksey, Chelsia", openingBalanceCents: 0, children: [{ id: "cms67iinl003v6a40mgcru0gj", name: "Koi Coffer" }] },
  { familyId: "cms67kfo600bi6a40nejptfex", familyName: "Lamarriel Johnson Family", accountKey: "MURRAY", payerName: "Johnson, Lamarriel", openingBalanceCents: 25_500, children: [{ id: "cms67kgq100bo6a40zgq54ze7", name: "Kaleb Murray" }] },
  { familyId: "cms67kx5t00dm6a40t0teq4aa", familyName: "Michelle Quarles Family", accountKey: "QUARLES", payerName: "Quarles, Michelle", openingBalanceCents: 0, children: [{ id: "cms67ky7i00ds6a404ssereul", name: "Essence Quarles" }, { id: "cms67ualw00t16a408ux6ct5m", name: "Xion Quarles" }] },
  { familyId: "cms67iq59004m6a40p3joobv1", familyName: "Noura Elofir Family", accountKey: "ELOFIR", payerName: "Elofir, Noura", openingBalanceCents: 0, children: [{ id: "cms67ir75004s6a40jqu9vyks", name: "Sami Elofir" }] },
  { familyId: "cms67lq2800fz6a40hp7yjgq0", familyName: "Sharon ` Hall Family", accountKey: "STINSON", payerName: "Hall, Sharon `", openingBalanceCents: 31_947, children: [{ id: "cms67lrdt00g76a40wvua30nt", name: "Charlie Stinson" }] },
] as const;

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}
function input(value: Prisma.JsonObject) { return value as Prisma.InputJsonObject; }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
function hash(value: Buffer | unknown) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex");
}

function verifySource() {
  const path = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH);
  invariant(path, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const buffer = readFileSync(path);
  invariant(hash(buffer) === SOURCE_SHA256, "Oakleaf balance source fingerprint changed.");
  const rows = parseRenderedProcareBalanceRows(buffer);
  for (const target of targets) {
    const exact = rows.filter((row) => row.accountKey === target.accountKey && row.payerName === target.payerName && row.hidden && row.balanceCents === target.openingBalanceCents);
    invariant(exact.length > 0, `${target.familyName} no longer has the exact withdrawn source row.`);
    invariant(!rows.some((row) => row.accountKey === target.accountKey && row.payerName === target.payerName && !row.hidden), `${target.familyName} also has an active source row.`);
  }
}

async function loadState(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const familyIds = targets.map((target) => target.familyId);
  const [center, actor, families] = await Promise.all([
    client.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } } }),
    client.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, tenantId: true, email: true } }),
    client.family.findMany({ where: { id: { in: familyIds }, centerId: CENTER_ID }, select: {
      id: true, name: true,
      guardians: { select: { id: true, fullName: true, userId: true, customFields: true, user: { select: { id: true, role: true, isActive: true, mustResetPassword: true } } } },
      children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true } },
      billingAccount: { select: { id: true, balanceCents: true, customFields: true,
        invoices: { select: { id: true, number: true, status: true, totalCents: true, sourceSystem: true, externalId: true, customFields: true, ledgerEntries: { select: { id: true, amountCents: true, paymentId: true } } }, orderBy: { createdAt: "asc" } },
        payments: { select: { id: true, status: true, provider: true, customFields: true } },
        ledgerEntries: { where: { balanceAfterCents: { not: null } }, select: { id: true, balanceAfterCents: true }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1 },
      } },
    }, orderBy: { id: "asc" } }),
  ]);
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center changed.");
  invariant(actor?.tenantId === center.organization.tenantId, "Oakleaf audit actor changed.");
  invariant(families.length === targets.length, "One or more reviewed Oakleaf withdrawn families are missing.");
  const plans = targets.map((target) => {
    const family = families.find((item) => item.id === target.familyId)!;
    invariant(family.name === target.familyName && family.billingAccount, `${target.familyName} identity or billing account changed.`);
    const reviewedChildren = target.children.map((expected) => {
      const child = family.children.find((item) => item.id === expected.id);
      invariant(child?.fullName === expected.name, `${expected.name} identity changed.`);
      return child;
    });
    const childIds = target.children.map((child) => child.id);
    const tuitionInvoices = family.billingAccount.invoices.filter((invoice) => {
      const fields = object(invoice.customFields);
      return childIds.includes(clean(fields.childId) as never) && fields.chargeSource === "tuitionPlan" && ["2026-W33", "2026-W34"].includes(clean(fields.billingPeriod));
    });
    invariant(family.billingAccount.payments.length === 0, `${target.familyName} gained payment activity.`);
    for (const invoice of tuitionInvoices) {
      const blocker = invoiceVoidBlocker({ ...invoice, payments: family.billingAccount.payments });
      invariant(!blocker, `${invoice.number} cannot be safely voided: ${blocker}`);
    }
    const tuitionCents = tuitionInvoices.reduce((sum, invoice) => sum + invoiceLedgerBalanceCents(invoice.ledgerEntries), 0);
    invariant(family.billingAccount.balanceCents === target.openingBalanceCents + tuitionCents, `${target.familyName} balance no longer equals source opening balance plus reviewed tuition invoices.`);
    return { target, family, account: family.billingAccount, reviewedChildren, tuitionInvoices, tuitionCents };
  });
  const fingerprint = hash({ center, plans: plans.map((plan) => ({
    familyId: plan.family.id, balanceCents: plan.account.balanceCents,
    children: plan.reviewedChildren.map((child) => ({ id: child.id, status: child.enrollmentStatus, classroomId: child.classroomId, customFields: child.customFields })),
    invoices: plan.tuitionInvoices.map((invoice) => ({ id: invoice.id, status: invoice.status, totalCents: invoice.totalCents, ledgerEntries: invoice.ledgerEntries })),
    paymentIds: plan.account.payments.map((payment) => payment.id),
  })) });
  return { center, actor, plans, fingerprint };
}

async function apply(expectedFingerprint: string) {
  const before = await loadState();
  invariant(before.fingerprint === expectedFingerprint, "Oakleaf withdrawn-roster state changed; rerun preview.");
  const appliedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await loadState(tx);
    invariant(current.fingerprint === expectedFingerprint, "Oakleaf withdrawn-roster state changed inside transaction.");
    for (const plan of current.plans) {
      for (const invoice of [...plan.tuitionInvoices].reverse()) {
        const reversalCents = invoiceLedgerBalanceCents(invoice.ledgerEntries);
        const updated = await tx.invoice.updateMany({ where: { id: invoice.id, status: PaymentStatus.OPEN }, data: { status: PaymentStatus.VOID, customFields: input({ ...object(invoice.customFields), voidedAt: appliedAt.toISOString(), voidedByUserId: current.actor.id, voidedByEmail: current.actor.email, voidReason: "Source account was marked withdrawn before W33/W34 tuition." }) } });
        invariant(updated.count === 1, `${invoice.number} changed before void.`);
        const account = await tx.billingAccount.update({ where: { id: plan.account.id }, data: { balanceCents: { decrement: reversalCents } }, select: { balanceCents: true } });
        await tx.ledgerEntry.create({ data: { billingAccountId: plan.account.id, invoiceId: invoice.id, type: "invoice_void", description: `Voided ${invoice.number}: source account marked withdrawn`, amountCents: -reversalCents, balanceAfterCents: account.balanceCents, sourceSystem: "oakleaf_source_roster_correction_reapplied_2026_08_18", externalId: `oakleaf-withdrawn-reapplied-invoice-void:${invoice.id}`, metadata: { sourceSha256: SOURCE_SHA256, evidence: EVIDENCE, previousStatus: PaymentStatus.OPEN, updatedStatus: PaymentStatus.VOID } } });
      }
      for (const child of plan.reviewedChildren) {
        await tx.child.update({ where: { id: child.id }, data: { enrollmentStatus: "withdrawn", classroomId: null, customFields: input({ ...object(child.customFields), tuitionBillingEnabled: false, tuitionAutobillEligible: false, tuitionBillingHoldReason: "Oakleaf source account marked withdrawn before W33/W34 tuition.", tuitionBillingUpdatedAt: appliedAt.toISOString(), tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf source roster correction 2026-08-18", enrollmentStatusUpdatedAt: appliedAt.toISOString(), enrollmentStatusUpdatedBy: "Brenden Bruner - Oakleaf source roster correction 2026-08-18", enrollmentStatusEvidence: { source: "oakleaf_account_balance_summary", sourceAsOf: "2026-08-02", sourceSha256: SOURCE_SHA256, marker: "w/Hidden" } }) } });
      }
      await tx.billingAccount.update({ where: { id: plan.account.id }, data: { customFields: input({ ...object(plan.account.customFields), tuitionAutobillEnabled: false, tuitionAutobillUpdatedAt: appliedAt.toISOString(), tuitionAutobillUpdatedBy: "Brenden Bruner - Oakleaf source roster correction 2026-08-18" }) } });
      await tx.auditLog.create({ data: { tenantId: current.actor.tenantId, centerId: CENTER_ID, userId: current.actor.id, action: "billing.oakleaf_withdrawn_roster_corrected", resource: "Family", resourceId: plan.family.id, metadata: { sourceSha256: SOURCE_SHA256, evidence: EVIDENCE, childrenWithdrawn: plan.reviewedChildren.map((child) => child.id), invoicesVoided: plan.tuitionInvoices.map((invoice) => invoice.id), reversedCents: plan.tuitionCents, openingBalancePreservedCents: plan.target.openingBalanceCents, paymentsChanged: false } } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });

  const barnhart = before.plans.find((plan) => (
    "compensatePreparedParentAccess" in plan.target && plan.target.compensatePreparedParentAccess
  ));
  invariant(barnhart, "Barnhart compensation target missing.");
  const guardian = barnhart.family.guardians.find((item) => item.fullName === "Mariah Barnhart");
  if (guardian?.userId) {
    invariant(guardian.user?.role === "PARENT_GUARDIAN" && guardian.user.mustResetPassword, "Barnhart parent link is not the prepared no-invite account.");
    const disabled = await disableParentPortalLoginForGuardian({ guardianId: guardian.id, actorEmail: before.actor.email, previousUserId: guardian.userId });
    invariant(disabled.ok, "Barnhart prepared parent access could not be compensated.");
  }

  const currentFamilies = await prisma.family.count({ where: { centerId: CENTER_ID, children: { some: { enrollmentStatus: { in: ["enrolled", "active", "current"] }, classroomId: { not: null } } } } });
  const verified = await prisma.family.findMany({ where: { id: { in: targets.map((target) => target.familyId) } }, select: { id: true, billingAccount: { select: { balanceCents: true, ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { balanceAfterCents: true } } } }, children: { select: { id: true, enrollmentStatus: true, classroomId: true } } } });
  for (const target of targets) {
    const family = verified.find((item) => item.id === target.familyId)!;
    invariant(family.billingAccount?.balanceCents === target.openingBalanceCents, `${target.familyName} final source balance is wrong.`);
    invariant(
      family.billingAccount.ledgerEntries[0]?.balanceAfterCents === target.openingBalanceCents
        || (target.openingBalanceCents === 0 && family.billingAccount.ledgerEntries.length === 0),
      `${target.familyName} final ledger balance is wrong.`,
    );
    invariant(target.children.every((child) => family.children.find((item) => item.id === child.id)?.enrollmentStatus === "withdrawn"), `${target.familyName} still has a reviewed current child.`);
  }
  console.log(JSON.stringify({ ok: true, currentFamilies, familiesCorrected: targets.length, childrenWithdrawn: targets.reduce((sum, target) => sum + target.children.length, 0), invoicesVoided: before.plans.reduce((sum, plan) => sum + plan.tuitionInvoices.length, 0), balancesReversedCents: before.plans.reduce((sum, plan) => sum + plan.tuitionCents, 0), sourceOpeningBalancesPreservedCents: targets.reduce((sum, target) => sum + target.openingBalanceCents, 0), paymentsChanged: 0, barnhartPreparedAccessCompensated: Boolean(guardian?.userId) }, null, 2));
}

async function main() {
  verifySource();
  const before = await loadState();
  const applyMode = process.argv.includes(APPLY);
  console.log(JSON.stringify({ mode: applyMode ? "apply-preflight" : "dry-run", fingerprint: before.fingerprint, center: CENTER_NAME, familiesToCorrect: before.plans.length, childrenToWithdraw: before.plans.reduce((sum, plan) => sum + plan.reviewedChildren.length, 0), invoicesToVoid: before.plans.reduce((sum, plan) => sum + plan.tuitionInvoices.length, 0), balanceToReverseCents: before.plans.reduce((sum, plan) => sum + plan.tuitionCents, 0), sourceOpeningBalanceToPreserveCents: targets.reduce((sum, target) => sum + target.openingBalanceCents, 0), paymentsToChange: 0 }, null, 2));
  if (!applyMode) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expected = process.argv.find((arg) => arg.startsWith(FINGERPRINT))?.slice(FINGERPRINT.length);
  invariant(expected, `Apply requires ${FINGERPRINT}<value>.`);
  await apply(expected);
}

main().finally(() => prisma.$disconnect());
