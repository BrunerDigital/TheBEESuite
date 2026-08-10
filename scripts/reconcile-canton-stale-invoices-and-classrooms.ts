import "./load-env";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ewg4a004i6alwl5c6i3w4";
const CENTER_NAME = "Kid City USA - Canton";
const IMPORTED_INVOICE_PREFIX = `procare-opening-balance:${CENTER_ID}:`;
const ARCHIVE_REASON = "Director requested removal of empty duplicate classrooms; retained ProCare room is canonical.";

const CLASSROOM_MERGES = [
  { archivedName: "Preschool 1", retainedName: "Preschool" },
  { archivedName: "preschool 2", retainedName: "Preschool Two" },
  { archivedName: "Toddlers", retainedName: "Toddlers" },
  { archivedName: "Waddlers", retainedName: "Waddlers" },
] as const;

type JsonRecord = Record<string, Prisma.JsonValue>;

function record(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function publicClassroomPlan(classroom: {
  archivedId: string;
  archivedName: string;
  retainedId: string;
  retainedName: string;
  staffToMove: number;
  liveLocationsToMove: number;
  preservedHistoricalTransitions: number;
  alreadyApplied: boolean;
}) {
  return {
    archivedId: classroom.archivedId,
    archivedName: classroom.archivedName,
    retainedId: classroom.retainedId,
    retainedName: classroom.retainedName,
    staffToMove: classroom.staffToMove,
    liveLocationsToMove: classroom.liveLocationsToMove,
    preservedHistoricalTransitions: classroom.preservedHistoricalTransitions,
    alreadyApplied: classroom.alreadyApplied,
  };
}

function option(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? String(argv[index + 1] ?? "").trim() : "";
}

async function buildPlan() {
  const center = await prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      status: true,
      organization: { select: { tenantId: true } },
    },
  });
  invariant(center?.name === CENTER_NAME, `Expected ${CENTER_NAME}; found ${center?.name ?? "no center"}.`);
  invariant(center.status === "active", `Expected an active center; found ${center.status}.`);

  const [invoices, classrooms, paymentCount, accountBalances] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        billingAccount: { family: { centerId: CENTER_ID } },
        sourceSystem: "procare",
        externalId: { startsWith: IMPORTED_INVOICE_PREFIX },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        number: true,
        status: true,
        totalCents: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        items: { select: { description: true, amountCents: true }, orderBy: { id: "asc" } },
        billingAccount: { select: { id: true, balanceCents: true } },
        ledgerEntries: { select: { id: true, type: true, amountCents: true }, orderBy: { id: "asc" } },
      },
    }),
    prisma.classroom.findMany({
      where: { centerId: CENTER_ID },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        sourceSystem: true,
        externalId: true,
        customFields: true,
        _count: {
          select: {
            children: true,
            staff: true,
            currentChildLocations: true,
            childLocationTransitionsFrom: true,
            childLocationTransitionsTo: true,
          },
        },
      },
    }),
    prisma.payment.count({ where: { billingAccount: { family: { centerId: CENTER_ID } } } }),
    prisma.billingAccount.findMany({
      where: { family: { centerId: CENTER_ID } },
      orderBy: { id: "asc" },
      select: { id: true, balanceCents: true },
    }),
  ]);

  invariant(invoices.length === 32, `Expected 32 imported opening-balance invoices; found ${invoices.length}.`);
  for (const invoice of invoices) {
    invariant(invoice.items.length === 1, `${invoice.number} does not have exactly one imported item.`);
    invariant(invoice.items[0]?.description === "Imported ProCare opening balance", `${invoice.number} is not an imported opening-balance invoice.`);
    invariant(invoice.items[0]?.amountCents === invoice.totalCents, `${invoice.number} item total changed.`);
    invariant(invoice.ledgerEntries.every((entry) => entry.type === "procare_balance" && entry.amountCents === invoice.totalCents), `${invoice.number} ledger provenance changed.`);
  }

  const classroomPlans = CLASSROOM_MERGES.map((merge) => {
    const sameName = classrooms.filter((classroom) => classroom.name.toLowerCase() === merge.archivedName.toLowerCase());
    const archived = sameName.find((classroom) => classroom.sourceSystem !== "procare");
    const retained = classrooms.find((classroom) => classroom.name === merge.retainedName && classroom.sourceSystem === "procare");
    invariant(archived, `Legacy classroom ${merge.archivedName} was not found.`);
    invariant(retained, `Retained ProCare classroom ${merge.retainedName} was not found.`);
    invariant(archived.id !== retained.id, `${merge.archivedName} resolves to the retained classroom.`);
    invariant(archived._count.children === 0, `${merge.archivedName} now has ${archived._count.children} assigned children.`);
    const archivedFields = record(archived.customFields);
    const alreadyApplied = archivedFields.archived === true && archivedFields.mergedIntoClassroomId === retained.id;
    return {
      archivedId: archived.id,
      archivedName: archived.name,
      retainedId: retained.id,
      retainedName: retained.name,
      staffToMove: archived._count.staff,
      liveLocationsToMove: archived._count.currentChildLocations,
      preservedHistoricalTransitions: archived._count.childLocationTransitionsFrom + archived._count.childLocationTransitionsTo,
      alreadyApplied,
      archivedCustomFields: archivedFields,
    };
  });

  const source = {
    center: { id: center.id, name: center.name, status: center.status },
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      totalCents: invoice.totalCents,
      externalId: invoice.externalId,
      billingAccountId: invoice.billingAccount.id,
      accountBalanceCents: invoice.billingAccount.balanceCents,
      ledgerEntryIds: invoice.ledgerEntries.map((entry) => entry.id),
    })),
    classrooms: classroomPlans.map(publicClassroomPlan),
    paymentCount,
    accountBalances,
  };

  return {
    center,
    invoices,
    classroomPlans,
    paymentCount,
    accountBalances,
    fingerprint: fingerprint(source),
  };
}

function publicPlan(plan: Awaited<ReturnType<typeof buildPlan>>) {
  const openInvoices = plan.invoices.filter((invoice) => invoice.status === PaymentStatus.OPEN);
  return {
    center: { id: plan.center.id, name: plan.center.name, status: plan.center.status },
    fingerprint: plan.fingerprint,
    staleImportedInvoices: plan.invoices.length,
    openStaleImportedInvoices: openInvoices.length,
    openStaleImportedInvoiceCents: openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0),
    currentAccountBalanceCents: plan.accountBalances.reduce((sum, account) => sum + account.balanceCents, 0),
    paymentsPreserved: plan.paymentCount,
    classrooms: plan.classroomPlans.map(publicClassroomPlan),
    recurringTuitionActivation: "held_pending_explicit_effective_month_and_billing_day",
  };
}

async function applyPlan(initial: Awaited<ReturnType<typeof buildPlan>>) {
  const appliedAt = new Date();
  const balancesBefore = stableJson(initial.accountBalances);
  const paymentCountBefore = initial.paymentCount;

  await prisma.$transaction(async (tx) => {
    for (const invoice of initial.invoices) {
      if (invoice.status === PaymentStatus.VOID) continue;
      invariant(invoice.status === PaymentStatus.OPEN, `${invoice.number} changed to ${invoice.status}.`);
      const update = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          status: PaymentStatus.OPEN,
          sourceSystem: "procare",
          externalId: invoice.externalId,
          totalCents: invoice.totalCents,
        },
        data: {
          status: PaymentStatus.VOID,
          customFields: {
            ...record(invoice.customFields),
            staleImportedOpeningBalanceVoidedAt: appliedAt.toISOString(),
            staleImportedOpeningBalanceVoidReason: "Reviewed ProCare balance reconciliation superseded this imported opening-balance invoice.",
            balancePreserved: true,
          } as Prisma.InputJsonObject,
        },
      });
      invariant(update.count === 1, `${invoice.number} changed during the apply transaction.`);
      await tx.auditLog.create({
        data: {
          tenantId: initial.center.organization.tenantId,
          centerId: CENTER_ID,
          action: "billing.stale_imported_opening_invoice_voided",
          resource: "Invoice",
          resourceId: invoice.id,
          metadata: {
            totalCents: invoice.totalCents,
            priorStatus: invoice.status,
            nextStatus: PaymentStatus.VOID,
            accountBalancePreserved: true,
            paymentsPreserved: true,
            sourceFingerprint: initial.fingerprint,
          },
        },
      });
    }

    for (const classroom of initial.classroomPlans) {
      if (classroom.alreadyApplied) continue;
      const source = await tx.classroom.findFirst({
        where: { id: classroom.archivedId, centerId: CENTER_ID },
        select: { id: true, customFields: true, _count: { select: { children: true } } },
      });
      invariant(source?._count.children === 0, `${classroom.archivedName} gained a child during apply.`);
      const target = await tx.classroom.findFirst({
        where: { id: classroom.retainedId, centerId: CENTER_ID, sourceSystem: "procare" },
        select: { id: true },
      });
      invariant(target, `Retained classroom ${classroom.retainedName} changed during apply.`);

      const staff = await tx.staffProfile.updateMany({
        where: { centerId: CENTER_ID, classroomId: classroom.archivedId },
        data: { classroomId: classroom.retainedId },
      });
      const liveLocations = await tx.childLiveLocation.updateMany({
        where: { centerId: CENTER_ID, currentClassroomId: classroom.archivedId },
        data: { currentClassroomId: classroom.retainedId },
      });
      invariant(staff.count === classroom.staffToMove, `${classroom.archivedName} staff count changed during apply.`);
      invariant(liveLocations.count === classroom.liveLocationsToMove, `${classroom.archivedName} live-location count changed during apply.`);

      await tx.classroom.update({
        where: { id: classroom.archivedId },
        data: {
          customFields: {
            ...record(source.customFields),
            archived: true,
            archivedAt: appliedAt.toISOString(),
            archivedReason: ARCHIVE_REASON,
            mergedIntoClassroomId: classroom.retainedId,
            mergedIntoClassroomName: classroom.retainedName,
          } as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: initial.center.organization.tenantId,
          centerId: CENTER_ID,
          action: "classroom.archived_merged",
          resource: "Classroom",
          resourceId: classroom.archivedId,
          metadata: {
            retainedClassroomId: classroom.retainedId,
            staffMoved: staff.count,
            liveLocationsMoved: liveLocations.count,
            historicalTransitionsPreserved: classroom.preservedHistoricalTransitions,
            sourceFingerprint: initial.fingerprint,
          },
        },
      });
    }
  }, { maxWait: 10_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  const verified = await buildPlan();
  invariant(verified.invoices.every((invoice) => invoice.status === PaymentStatus.VOID), "A stale imported invoice remains open.");
  invariant(verified.classroomPlans.every((classroom) => classroom.alreadyApplied), "A duplicate classroom was not archived.");
  invariant(stableJson(verified.accountBalances) === balancesBefore, "A billing-account balance changed during reconciliation.");
  invariant(verified.paymentCount === paymentCountBefore, "Payment history changed during reconciliation.");
  return publicPlan(verified);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const expectedFingerprint = option(argv, "--confirm-fingerprint");
  const plan = await buildPlan();
  console.log(JSON.stringify({ mode: apply ? "apply-preflight" : "dry-run", ...publicPlan(plan) }, null, 2));
  if (!apply) return;
  invariant(expectedFingerprint, "Apply requires --confirm-fingerprint.");
  invariant(expectedFingerprint === plan.fingerprint, "Fingerprint mismatch; rerun the dry-run before applying.");
  const result = await applyPlan(plan);
  console.log(JSON.stringify({ mode: "apply-result", result }, null, 2));
}

const invokedScriptUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedScriptUrl === import.meta.url) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
