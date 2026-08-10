import type { Prisma } from "@prisma/client";

export const accountsReceivableFamilySelect = {
  id: true,
  name: true,
  centerId: true,
  billingAccount: {
    select: {
      id: true,
      balanceCents: true,
      invoices: {
        where: { status: "OPEN" },
        select: {
          id: true,
          dueDate: true,
        },
      },
    },
  },
} satisfies Prisma.FamilySelect;

export const accountsReceivableSummaryFamilySelect = {
  id: true,
  centerId: true,
  billingAccount: {
    select: {
      balanceCents: true,
      invoices: {
        where: { status: "OPEN" },
        select: {
          dueDate: true,
        },
      },
    },
  },
} satisfies Prisma.FamilySelect;

export type AccountsReceivableFamilyRow = Prisma.FamilyGetPayload<{
  select: typeof accountsReceivableFamilySelect;
}>;

export type AccountsReceivableSummaryFamilyRow = Prisma.FamilyGetPayload<{
  select: typeof accountsReceivableSummaryFamilySelect;
}>;

export type SchoolAccountBalanceStatus = "owes" | "current" | "credit";

export type SchoolAccountBalance = {
  id: string;
  familyId: string;
  familyName: string;
  centerId: string | null;
  centerName: string;
  balanceCents: number;
  hasBillingAccount: boolean;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  oldestOpenDueDate: string | null;
  status: SchoolAccountBalanceStatus;
};

export type SchoolAccountsReceivableSummary = {
  centerId: string;
  centerName: string;
  totalAccountCount: number;
  owingAccountCount: number;
  currentAccountCount: number;
  creditAccountCount: number;
  overdueAccountCount: number;
  totalOwedCents: number;
  totalCreditCents: number;
  netBalanceCents: number;
};

export type AccountsReceivableSummary = {
  schools: SchoolAccountsReceivableSummary[];
  totalAccountCount: number;
  owingAccountCount: number;
  currentAccountCount: number;
  creditAccountCount: number;
  overdueAccountCount: number;
  totalOwedCents: number;
  totalCreditCents: number;
  netBalanceCents: number;
  asOf: string;
};

export type AccountsReceivableSnapshot = AccountsReceivableSummary & {
  accounts: SchoolAccountBalance[];
};

export type ReceivableAgingReport = {
  currentCents: number;
  oneToThirtyCents: number;
  thirtyOneToSixtyCents: number;
  sixtyOnePlusCents: number;
};

type ReceivableAgingAccount = {
  id: string;
  balanceCents: number;
};

type ReceivableAgingInvoice = {
  billingAccountId: string;
  totalCents: number;
  dueDate: Date;
};

type AccountBalanceAccessSubject =
  | string
  | null
  | undefined
  | {
      role?: string | null;
      accessScope?: string | null;
    };

const accountBalanceRoles = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "CENTER_DIRECTOR",
  "ASSISTANT_DIRECTOR",
  "BILLING_ADMIN",
  "READ_ONLY_AUDITOR",
]);

const executiveAccountBalanceRoles = new Set([
  "PLATFORM_OWNER",
  "BRAND_ADMIN",
  "REGIONAL_MANAGER",
  "READ_ONLY_AUDITOR",
]);

function accessRole(subject: AccountBalanceAccessSubject) {
  return typeof subject === "string" || subject == null ? subject : subject.role;
}

export function canViewAccountBalances(subject: AccountBalanceAccessSubject) {
  const role = accessRole(subject);
  return Boolean(role && accountBalanceRoles.has(role));
}

export function isExecutiveAccountBalanceView(subject: AccountBalanceAccessSubject) {
  const role = accessRole(subject);
  if (!role || !executiveAccountBalanceRoles.has(role)) return false;
  if (role === "PLATFORM_OWNER") return true;
  if (typeof subject === "string" || subject == null) return false;
  return subject.accessScope === "tenant" || subject.accessScope === "platform";
}

export function accountBalanceCenterIds(user: {
  role: string;
  primaryCenterId?: string | null;
  centerIds?: readonly string[];
}) {
  if (user.role === "CENTER_DIRECTOR" || user.role === "ASSISTANT_DIRECTOR") {
    return user.primaryCenterId ? [user.primaryCenterId] : [];
  }
  if (accountBalanceRoles.has(user.role)) {
    return [...new Set(user.centerIds ?? [])];
  }
  return [];
}

function accountStatus(balanceCents: number): SchoolAccountBalanceStatus {
  if (balanceCents > 0) return "owes";
  if (balanceCents < 0) return "credit";
  return "current";
}

const statusOrder: Record<SchoolAccountBalanceStatus, number> = {
  owes: 0,
  credit: 1,
  current: 2,
};

function isOverdue(dueDate: Date, asOf: Date) {
  return dueDate.toISOString().slice(0, 10) < asOf.toISOString().slice(0, 10);
}

export function buildNetReceivableAging(
  accounts: readonly ReceivableAgingAccount[],
  invoices: readonly ReceivableAgingInvoice[],
  asOf = new Date(),
): ReceivableAgingReport {
  const report: ReceivableAgingReport = {
    currentCents: 0,
    oneToThirtyCents: 0,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 0,
  };
  const invoicesByAccountId = new Map<string, ReceivableAgingInvoice[]>();

  for (const invoice of invoices) {
    const accountInvoices = invoicesByAccountId.get(invoice.billingAccountId) ?? [];
    accountInvoices.push(invoice);
    invoicesByAccountId.set(invoice.billingAccountId, accountInvoices);
  }

  for (const account of accounts) {
    const receivableCents = Math.max(account.balanceCents, 0);
    if (!receivableCents) continue;

    const accountInvoices = (invoicesByAccountId.get(account.id) ?? [])
      .filter((invoice) => invoice.totalCents > 0)
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
    const openInvoiceTotalCents = accountInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
    // Account-level payments are applied to the oldest open invoices first. Partial
    // payments can leave those invoices OPEN at face value, so remove that paid
    // portion before assigning the remaining receivable to aging buckets.
    let paidAgainstOpenInvoicesCents = Math.max(openInvoiceTotalCents - receivableCents, 0);
    let agedReceivableCents = 0;

    for (const invoice of accountInvoices) {
      const paidInvoiceCents = Math.min(paidAgainstOpenInvoicesCents, invoice.totalCents);
      paidAgainstOpenInvoicesCents -= paidInvoiceCents;
      const remainingInvoiceCents = invoice.totalCents - paidInvoiceCents;
      if (!remainingInvoiceCents) continue;

      const daysPastDue = Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / 86_400_000);
      if (daysPastDue <= 0) report.currentCents += remainingInvoiceCents;
      else if (daysPastDue <= 30) report.oneToThirtyCents += remainingInvoiceCents;
      else if (daysPastDue <= 60) report.thirtyOneToSixtyCents += remainingInvoiceCents;
      else report.sixtyOnePlusCents += remainingInvoiceCents;
      agedReceivableCents += remainingInvoiceCents;
    }

    // Ledger-only charges have no invoice due date; keep them visible as current
    // receivables so the aging buckets always reconcile to the account balance.
    report.currentCents += Math.max(receivableCents - agedReceivableCents, 0);
  }

  return report;
}

export function buildAccountsReceivableSummary(
  families: readonly AccountsReceivableSummaryFamilyRow[],
  centerNameById: Readonly<Record<string, string>>,
  asOf = new Date(),
): AccountsReceivableSummary {
  const schoolsById = new Map<string, SchoolAccountsReceivableSummary>();
  let totalAccountCount = 0;
  let owingAccountCount = 0;
  let currentAccountCount = 0;
  let creditAccountCount = 0;
  let overdueAccountCount = 0;
  let totalOwedCents = 0;
  let totalCreditCents = 0;
  let netBalanceCents = 0;

  for (const family of families) {
    if (!family.centerId) continue;
    const balanceCents = family.billingAccount?.balanceCents ?? 0;
    const status = accountStatus(balanceCents);
    const overdue = Boolean(family.billingAccount?.invoices.some((invoice) => isOverdue(invoice.dueDate, asOf)));
    const school = schoolsById.get(family.centerId) ?? {
      centerId: family.centerId,
      centerName: centerNameById[family.centerId] ?? "School",
      totalAccountCount: 0,
      owingAccountCount: 0,
      currentAccountCount: 0,
      creditAccountCount: 0,
      overdueAccountCount: 0,
      totalOwedCents: 0,
      totalCreditCents: 0,
      netBalanceCents: 0,
    };

    school.totalAccountCount += 1;
    school.owingAccountCount += status === "owes" ? 1 : 0;
    school.currentAccountCount += status === "current" ? 1 : 0;
    school.creditAccountCount += status === "credit" ? 1 : 0;
    school.overdueAccountCount += overdue ? 1 : 0;
    school.totalOwedCents += Math.max(balanceCents, 0);
    school.totalCreditCents += Math.min(balanceCents, 0);
    school.netBalanceCents += balanceCents;
    schoolsById.set(family.centerId, school);

    totalAccountCount += 1;
    owingAccountCount += status === "owes" ? 1 : 0;
    currentAccountCount += status === "current" ? 1 : 0;
    creditAccountCount += status === "credit" ? 1 : 0;
    overdueAccountCount += overdue ? 1 : 0;
    totalOwedCents += Math.max(balanceCents, 0);
    totalCreditCents += Math.min(balanceCents, 0);
    netBalanceCents += balanceCents;
  }

  return {
    schools: [...schoolsById.values()].sort(
      (left, right) => right.totalOwedCents - left.totalOwedCents
        || left.centerName.localeCompare(right.centerName),
    ),
    totalAccountCount,
    owingAccountCount,
    currentAccountCount,
    creditAccountCount,
    overdueAccountCount,
    totalOwedCents,
    totalCreditCents,
    netBalanceCents,
    asOf: asOf.toISOString(),
  };
}

export function buildAccountsReceivableSnapshot(
  families: readonly AccountsReceivableFamilyRow[],
  centerNameById: Readonly<Record<string, string>>,
  asOf = new Date(),
): AccountsReceivableSnapshot {
  const accounts = families.map((family): SchoolAccountBalance => {
    const balanceCents = family.billingAccount?.balanceCents ?? 0;
    const openInvoices = family.billingAccount?.invoices ?? [];
    const overdueInvoices = openInvoices.filter((invoice) => isOverdue(invoice.dueDate, asOf));
    const oldestOpenDueDate = openInvoices.reduce<Date | null>(
      (oldest, invoice) => !oldest || invoice.dueDate < oldest ? invoice.dueDate : oldest,
      null,
    );

    return {
      id: family.billingAccount?.id ?? `family:${family.id}`,
      familyId: family.id,
      familyName: family.name,
      centerId: family.centerId,
      centerName: family.centerId ? centerNameById[family.centerId] ?? "School" : "School not assigned",
      balanceCents,
      hasBillingAccount: Boolean(family.billingAccount),
      openInvoiceCount: openInvoices.length,
      overdueInvoiceCount: overdueInvoices.length,
      oldestOpenDueDate: oldestOpenDueDate?.toISOString() ?? null,
      status: accountStatus(balanceCents),
    };
  }).sort((left, right) => {
    const statusDifference = statusOrder[left.status] - statusOrder[right.status];
    if (statusDifference) return statusDifference;
    if (left.status === "owes" && left.balanceCents !== right.balanceCents) {
      return right.balanceCents - left.balanceCents;
    }
    if (left.status === "credit" && left.balanceCents !== right.balanceCents) {
      return left.balanceCents - right.balanceCents;
    }
    return left.familyName.localeCompare(right.familyName);
  });

  return {
    ...buildAccountsReceivableSummary(families, centerNameById, asOf),
    accounts,
  };
}
