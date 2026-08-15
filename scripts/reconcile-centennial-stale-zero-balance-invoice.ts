import "./load-env";
import { createHash } from "node:crypto";
import { PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cms3g2the000i6a7wdd8pa20s";
const CENTER_NAME = "Miss Honey's Learning Center - Centennial";
const DUPLICATE_FAMILY_ID = "cms3lo7s802hz6avw9guji3ym";
const CURRENT_FAMILY_ID = "cms7g6a2h002nl704ksqf77sx";
const CURRENT_CHILD_ID = "cms7g6ad2002rl704180ttkg8";
const STALE_CHILD_ID = "cms3lo8g202i96avwpu9g4tf1";
const GUARDIAN_EXTERNAL_ID = "230741";
const INVOICE_ID = "cmsgdw3rh0019l304foznm1jg";
const INVOICE_NUMBER = "INV-20260805-A64EB178";
const INVOICE_TOTAL_CENTS = 45_200;
const APPLY_FLAG = "--apply";
const CONFIRM_SCOPE_FLAG = "--confirm-centennial-stale-zero-balance-invoice";
const CONFIRM_FINGERPRINT_OPTION = "--confirm-fingerprint";
const AUDIT_ACTION = "billing.centennial_stale_duplicate_invoice_voided";
const VOID_REASON =
  "The reviewed Centennial balance reconciliation set both Behrin accounts to $0; this W31 invoice remained open on the childless duplicate family.";

type Client = Prisma.TransactionClient | typeof prisma;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function option(argv: string[], name: string) {
  const equals = argv.find((value) => value.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1]?.trim() ?? "") : "";
}

function parseArgs(argv = process.argv.slice(2)) {
  const apply = argv.includes(APPLY_FLAG);
  const confirmScope = argv.includes(CONFIRM_SCOPE_FLAG);
  const confirmFingerprint = option(argv, CONFIRM_FINGERPRINT_OPTION);
  const allowed = new Set([
    APPLY_FLAG,
    CONFIRM_SCOPE_FLAG,
    CONFIRM_FINGERPRINT_OPTION,
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index].split("=")[0];
    invariant(allowed.has(name), `Unknown option: ${argv[index]}`);
    if (name === CONFIRM_FINGERPRINT_OPTION && !argv[index].includes("="))
      index += 1;
  }
  if (apply) {
    invariant(confirmScope, `Apply requires ${CONFIRM_SCOPE_FLAG}.`);
    invariant(
      confirmFingerprint,
      `Apply requires ${CONFIRM_FINGERPRINT_OPTION}.`,
    );
  }
  return { apply, confirmScope, confirmFingerprint };
}

async function loadState(client: Client = prisma) {
  const center = await client.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      status: true,
      organization: { select: { tenantId: true } },
    },
  });
  invariant(
    center?.name === CENTER_NAME,
    "The scoped Centennial center changed or was not found.",
  );
  invariant(center.status === "active", "Centennial is not active.");

  const families = await client.family.findMany({
    where: {
      id: { in: [DUPLICATE_FAMILY_ID, CURRENT_FAMILY_ID] },
      centerId: CENTER_ID,
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      sourceSystem: true,
      children: {
        select: {
          id: true,
          fullName: true,
          externalId: true,
          enrollmentStatus: true,
          classroomId: true,
        },
      },
      guardians: {
        select: {
          id: true,
          fullName: true,
          externalId: true,
          userId: true,
          user: { select: { id: true, role: true, isActive: true } },
        },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          invoices: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              number: true,
              status: true,
              totalCents: true,
              dueDate: true,
              createdAt: true,
              sourceSystem: true,
              externalId: true,
              customFields: true,
              items: {
                select: { id: true, description: true, amountCents: true },
              },
              ledgerEntries: {
                orderBy: [
                  { effectiveAt: "asc" },
                  { createdAt: "asc" },
                  { id: "asc" },
                ],
                select: { id: true, amountCents: true, paymentId: true },
              },
            },
          },
          payments: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              amountCents: true,
              status: true,
              provider: true,
              paidAt: true,
            },
          },
          ledgerEntries: {
            orderBy: [
              { effectiveAt: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
            select: {
              id: true,
              invoiceId: true,
              paymentId: true,
              type: true,
              amountCents: true,
              balanceAfterCents: true,
              effectiveAt: true,
              createdAt: true,
              sourceSystem: true,
              externalId: true,
            },
          },
        },
      },
    },
  });
  invariant(families.length === 2, "The scoped Behrin family pair changed.");

  const staleChild = await client.child.findUnique({
    where: { id: STALE_CHILD_ID },
    select: { id: true },
  });
  const scopedGuardianFamilyCount = await client.family.count({
    where: {
      centerId: CENTER_ID,
      guardians: { some: { externalId: GUARDIAN_EXTERNAL_ID } },
    },
  });
  const auditCount = await client.auditLog.count({
    where: {
      centerId: CENTER_ID,
      action: AUDIT_ACTION,
      resource: "Invoice",
      resourceId: INVOICE_ID,
    },
  });
  return { center, families, staleChild, scopedGuardianFamilyCount, auditCount };
}

type State = Awaited<ReturnType<typeof loadState>>;

function familyById(state: State, id: string) {
  const family = state.families.find((item) => item.id === id);
  invariant(family, `Missing scoped family ${id}.`);
  return family;
}

function preservedHistory(state: State) {
  return state.families
    .map((family) => ({
      familyId: family.id,
      accountId: family.billingAccount?.id ?? null,
      balanceCents: family.billingAccount?.balanceCents ?? null,
      invoices: (family.billingAccount?.invoices ?? []).map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.id === INVOICE_ID ? "TARGET_STATUS" : invoice.status,
        totalCents: invoice.totalCents,
        dueDate: invoice.dueDate.toISOString(),
        createdAt: invoice.createdAt.toISOString(),
        sourceSystem: invoice.sourceSystem,
        externalId: invoice.externalId,
        items: invoice.items,
      })),
      payments: family.billingAccount?.payments ?? [],
      ledgerEntries: family.billingAccount?.ledgerEntries ?? [],
    }))
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function buildPlan(state: State) {
  invariant(
    state.scopedGuardianFamilyCount === 2,
    "The Centennial guardian is linked to an unexpected number of families.",
  );
  const duplicate = familyById(state, DUPLICATE_FAMILY_ID);
  const current = familyById(state, CURRENT_FAMILY_ID);
  invariant(
    duplicate.name === "Behrin Family" &&
      duplicate.externalId === "BEHRIN",
    "The duplicate Behrin family identity changed.",
  );
  invariant(
    current.name === "Behrin Family" && current.externalId === "39960",
    "The current Behrin family identity changed.",
  );
  invariant(
    duplicate.sourceSystem === "procare" && current.sourceSystem === "procare",
    "A scoped Behrin family source changed.",
  );
  invariant(
    duplicate.children.length === 0,
    "The duplicate Behrin family gained a child.",
  );
  invariant(
    state.staleChild === null,
    "The stale invoice child record exists again; review the family merge before proceeding.",
  );

  const duplicateGuardian = duplicate.guardians.find(
    (guardian) => guardian.externalId === GUARDIAN_EXTERNAL_ID,
  );
  const currentGuardian = current.guardians.find(
    (guardian) => guardian.externalId === GUARDIAN_EXTERNAL_ID,
  );
  invariant(
    duplicateGuardian && duplicateGuardian.userId === null,
    "The duplicate Behrin guardian access link changed.",
  );
  invariant(
    currentGuardian?.user?.role === "PARENT_GUARDIAN" &&
      currentGuardian.user.isActive,
    "The current Behrin guardian access link changed.",
  );
  invariant(
    current.children.some(
      (child) =>
        child.id === CURRENT_CHILD_ID &&
        child.fullName === "Oliver Behrin" &&
        ["enrolled", "active", "current"].includes(
          child.enrollmentStatus.trim().toLowerCase(),
        ) &&
        Boolean(child.classroomId),
    ),
    "The current Behrin child enrollment changed.",
  );

  invariant(
    duplicate.billingAccount?.balanceCents === 0,
    "The duplicate Behrin balance is no longer $0.",
  );
  invariant(
    duplicate.billingAccount.payments.length === 0,
    "The duplicate Behrin account now has payment activity.",
  );
  const invoice = duplicate.billingAccount.invoices.find(
    (item) => item.id === INVOICE_ID,
  );
  invariant(
    invoice,
    "The stale Centennial invoice was not found on the duplicate account.",
  );
  invariant(
    invoice.number === INVOICE_NUMBER,
    "The stale Centennial invoice number changed.",
  );
  invariant(
    invoice.totalCents === INVOICE_TOTAL_CENTS,
    "The stale Centennial invoice amount changed.",
  );
  invariant(
    invoice.sourceSystem === "bee_suite" && invoice.externalId === null,
    "The stale Centennial invoice source changed.",
  );
  const invoiceFields = record(invoice.customFields);
  invariant(
    invoiceFields.childId === STALE_CHILD_ID,
    "The stale Centennial invoice child reference changed.",
  );
  invariant(
    invoiceFields.billingPeriod === "2026-W31" &&
      invoiceFields.chargeSource === "tuitionPlan",
    "The stale Centennial invoice purpose changed.",
  );
  invariant(
    invoice.ledgerEntries.every((entry) => entry.paymentId === null),
    "The stale Centennial invoice now has payment-linked ledger activity.",
  );
  invariant(
    invoice.ledgerEntries.reduce((sum, entry) => sum + entry.amountCents, 0) ===
      INVOICE_TOTAL_CENTS,
    "The stale Centennial invoice ledger changed.",
  );

  const alreadyApplied = invoice.status === PaymentStatus.VOID;
  if (alreadyApplied) {
    invariant(
      invoiceFields.staleDuplicateInvoiceBalancePreserved === true,
      "The invoice was voided outside this guarded reconciliation.",
    );
    invariant(
      state.auditCount === 1,
      "The guarded stale-invoice audit record is missing or duplicated.",
    );
  } else {
    invariant(
      current.billingAccount?.balanceCents === 0,
      "The current Behrin balance is no longer $0.",
    );
    invariant(
      invoice.status === PaymentStatus.OPEN,
      `The stale Centennial invoice changed to ${invoice.status}.`,
    );
    invariant(
      state.auditCount === 0,
      "A stale-invoice audit record already exists before apply.",
    );
  }

  const sourceFingerprint = fingerprint({
    centerId: state.center.id,
    duplicateFamilyId: duplicate.id,
    currentFamilyId: current.id,
    staleChildPresent: Boolean(state.staleChild),
    invoice: {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      totalCents: invoice.totalCents,
      dueDate: invoice.dueDate.toISOString(),
      createdAt: invoice.createdAt.toISOString(),
      sourceSystem: invoice.sourceSystem,
      externalId: invoice.externalId,
      customFields: invoice.customFields,
      items: invoice.items,
      ledgerEntries: invoice.ledgerEntries,
    },
    auditCount: state.auditCount,
    preservedHistory: preservedHistory(state),
  });
  return { duplicate, current, invoice, alreadyApplied, sourceFingerprint };
}

function summary(state: State, plan: ReturnType<typeof buildPlan>) {
  return {
    center: { id: state.center.id, name: state.center.name },
    fingerprint: plan.sourceFingerprint,
    duplicateFamily: {
      id: plan.duplicate.id,
      name: plan.duplicate.name,
      children: plan.duplicate.children.length,
    },
    currentFamily: {
      id: plan.current.id,
      name: plan.current.name,
      currentChildren: plan.current.children.length,
    },
    invoice: {
      id: plan.invoice.id,
      number: plan.invoice.number,
      status: plan.invoice.status,
      totalCents: plan.invoice.totalCents,
      targetStatus: PaymentStatus.VOID,
    },
    duplicateBalanceCents: plan.duplicate.billingAccount?.balanceCents,
    currentBalanceCents: plan.current.billingAccount?.balanceCents,
    paymentsPreserved: plan.duplicate.billingAccount?.payments.length ?? 0,
    ledgerEntriesPreserved: state.families.reduce(
      (sum, family) => sum + (family.billingAccount?.ledgerEntries.length ?? 0),
      0,
    ),
    financialHistory: state.families.map((family) => ({
      familyId: family.id,
      billingAccountId: family.billingAccount?.id ?? null,
      balanceCents: family.billingAccount?.balanceCents ?? null,
      invoices: (family.billingAccount?.invoices ?? []).map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        totalCents: invoice.totalCents,
      })),
      payments: family.billingAccount?.payments ?? [],
      ledgerEntries: family.billingAccount?.ledgerEntries ?? [],
    })),
    balanceMutationCents: 0,
    alreadyApplied: plan.alreadyApplied,
  };
}

async function applyPlan(initialState: State, expectedFingerprint: string) {
  const historyBefore = JSON.stringify(preservedHistory(initialState));
  const appliedAt = new Date();
  let invoiceUpdated = 0;
  let auditEntriesCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      const state = await loadState(tx);
      const plan = buildPlan(state);
      invariant(
        plan.sourceFingerprint === expectedFingerprint,
        "Centennial billing state changed after preflight.",
      );
      invariant(
        JSON.stringify(preservedHistory(state)) === historyBefore,
        "Centennial balance, payment, invoice, or ledger history changed after preflight.",
      );
      if (!plan.alreadyApplied) {
        const update = await tx.invoice.updateMany({
          where: {
            id: INVOICE_ID,
            billingAccountId: plan.duplicate.billingAccount?.id,
            status: PaymentStatus.OPEN,
            totalCents: INVOICE_TOTAL_CENTS,
            sourceSystem: "bee_suite",
          },
          data: {
            status: PaymentStatus.VOID,
            customFields: {
              ...record(plan.invoice.customFields),
              staleDuplicateInvoiceVoidedAt: appliedAt.toISOString(),
              staleDuplicateInvoiceVoidReason: VOID_REASON,
              staleDuplicateInvoiceBalancePreserved: true,
              currentFamilyId: CURRENT_FAMILY_ID,
              duplicateFamilyId: DUPLICATE_FAMILY_ID,
            } as Prisma.InputJsonObject,
          },
        });
        invariant(
          update.count === 1,
          "The stale Centennial invoice changed during apply.",
        );
        invoiceUpdated = update.count;

        await tx.auditLog.create({
          data: {
            tenantId: state.center.organization.tenantId,
            centerId: CENTER_ID,
            userId: null,
            action: AUDIT_ACTION,
            resource: "Invoice",
            resourceId: INVOICE_ID,
            metadata: {
              authorization: "user_requested_centennial_invoice_balance_repair",
              invoiceNumber: INVOICE_NUMBER,
              invoiceTotalCents: INVOICE_TOTAL_CENTS,
              duplicateFamilyId: DUPLICATE_FAMILY_ID,
              currentFamilyId: CURRENT_FAMILY_ID,
              priorStatus: PaymentStatus.OPEN,
              nextStatus: PaymentStatus.VOID,
              accountBalancesPreserved: true,
              paymentsPreserved: true,
              ledgerPreserved: true,
              sourceFingerprint: expectedFingerprint,
              reason: VOID_REASON,
            },
          },
        });
        auditEntriesCreated = 1;
      }

      const verifiedState = await loadState(tx);
      const verifiedPlan = buildPlan(verifiedState);
      invariant(
        verifiedPlan.alreadyApplied,
        "The stale Centennial invoice is still open.",
      );
      invariant(
        JSON.stringify(preservedHistory(verifiedState)) === historyBefore,
        "A Centennial balance, payment, invoice amount, or ledger entry changed during reconciliation.",
      );
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  return {
    invoiceUpdated,
    auditEntriesCreated,
    balanceMutationCents: 0,
    paymentsMutated: 0,
    ledgerEntriesMutated: 0,
  };
}

async function main() {
  const args = parseArgs();
  const state = await loadState();
  const plan = buildPlan(state);
  console.log(
    JSON.stringify(
      {
        mode: args.apply ? "apply-preflight" : "dry-run",
        ...summary(state, plan),
      },
      null,
      2,
    ),
  );
  if (!args.apply) return;
  invariant(
    args.confirmFingerprint === plan.sourceFingerprint,
    "Fingerprint mismatch. Rerun the dry run and confirm the current fingerprint.",
  );
  const result = await applyPlan(state, plan.sourceFingerprint);
  const verifiedState = await loadState();
  const verifiedPlan = buildPlan(verifiedState);
  console.log(
    JSON.stringify(
      {
        mode: "apply-result",
        result,
        verification: summary(verifiedState, verifiedPlan),
      },
      null,
      2,
    ),
  );
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
