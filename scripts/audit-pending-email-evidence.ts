import "./load-env";

import { buildOutstandingNonInvoiceChargesByAccount } from "@/lib/accounts-receivable";
import { prisma } from "@/lib/prisma";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function familySummary(family: {
  id: string;
  name: string;
  children?: Array<{ id: string; fullName: string; enrollmentStatus: string; customFields: unknown }>;
  billingAccount: null | {
    id: string;
    balanceCents: number;
    autopayPlaceholder: boolean;
    customFields: unknown;
    invoices: Array<{ id: string; number: string; status: string; dueDate: Date; totalCents: number; sourceSystem: string | null; externalId: string | null; customFields: unknown }>;
    payments: Array<{ id: string; amountCents: number; status: string; provider: string; externalIdPlaceholder: string | null; paidAt: Date | null; customFields: unknown }>;
    ledgerEntries: Array<{ id: string; type: string; amountCents: number; balanceAfterCents: number | null; effectiveAt: Date; createdAt: Date; invoiceId: string | null; paymentId: string | null; sourceSystem: string | null; externalId: string | null; metadata: unknown }>;
  };
}) {
  return {
    id: family.id,
    name: family.name,
    children: family.children ?? [],
    account: family.billingAccount ? {
      id: family.billingAccount.id,
      balanceCents: family.billingAccount.balanceCents,
      autopay: family.billingAccount.autopayPlaceholder,
      customFields: record(family.billingAccount.customFields),
      invoices: family.billingAccount.invoices,
      payments: family.billingAccount.payments,
      ledgerEntries: family.billingAccount.ledgerEntries,
    } : null,
  };
}

async function main() {
  const centers = await prisma.center.findMany({
    where: { OR: [
      { name: { contains: "Longmont", mode: "insensitive" } },
      { name: { contains: "Holly Hill", mode: "insensitive" } },
      { name: { contains: "Pisgah Forest", mode: "insensitive" } },
      { name: { contains: "Corpus Christi", mode: "insensitive" } },
      { name: { contains: "Kokomo", mode: "insensitive" } },
      { name: { contains: "Lee", mode: "insensitive" } },
    ] },
    select: { id: true, name: true, timezone: true },
  });
  const byNeedle = (needle: string) => centers.find((center) => center.name.toLowerCase().includes(needle.toLowerCase()));
  const longmont = byNeedle("Longmont");
  const holly = byNeedle("Holly Hill");
  const pisgah = byNeedle("Pisgah Forest");
  const corpus = byNeedle("Corpus Christi");
  const kokomo = byNeedle("Kokomo");
  const lee = byNeedle("Lees Summit");

  const familyInclude = {
    billingAccount: {
      include: {
        invoices: { orderBy: { dueDate: "asc" as const } },
        payments: { orderBy: { paidAt: "asc" as const } },
        ledgerEntries: { orderBy: { effectiveAt: "asc" as const } },
      },
    },
  };

  const [corpusFamilies, myishaFamilies, myishaRefunds, pisgahFamilies, pisgahStaff, pisgahPlans, hollyFamilies, kokomoPrograms, longmontFamilies] = await Promise.all([
    corpus ? prisma.family.findMany({
      where: { centerId: corpus.id, OR: [
        { name: { contains: "Avery", mode: "insensitive" } },
        { name: { contains: "Abila", mode: "insensitive" } },
        { guardians: { some: { fullName: { contains: "Avery", mode: "insensitive" } } } },
        { guardians: { some: { fullName: { contains: "Abila", mode: "insensitive" } } } },
      ] },
      select: { id: true, name: true, customFields: true, guardians: { select: { id: true, fullName: true, email: true, userId: true, relation: true, customFields: true, user: { select: { id: true, email: true, isActive: true } } } }, children: { select: { id: true, fullName: true, enrollmentStatus: true, startDate: true, customFields: true } } },
    }) : [],
    lee ? prisma.family.findMany({
      where: { centerId: lee.id, OR: [{ name: { contains: "Adams", mode: "insensitive" } }, { guardians: { some: { fullName: { contains: "Myisha", mode: "insensitive" } } } }] },
      include: familyInclude,
    }) : [],
    lee ? prisma.refundRequest.findMany({ where: { centerId: lee.id, family: { guardians: { some: { fullName: { contains: "Myisha", mode: "insensitive" } } } } }, orderBy: { requestedAt: "asc" } }) : [],
    pisgah ? prisma.family.findMany({
      where: { centerId: pisgah.id, OR: [
        { guardians: { some: { AND: [{ fullName: { contains: "Hannah", mode: "insensitive" } }, { fullName: { contains: "Barnett", mode: "insensitive" } }] } } },
        { guardians: { some: { AND: [{ fullName: { contains: "Max", mode: "insensitive" } }, { fullName: { contains: "Baggaley", mode: "insensitive" } }] } } },
        { children: { some: { AND: [{ fullName: { contains: "Tyler", mode: "insensitive" } }, { fullName: { contains: "Smith", mode: "insensitive" } }] } } },
        { children: { some: { fullName: { contains: "Sloane Baggaley", mode: "insensitive" } } } },
      ] },
      select: { id: true, name: true, customFields: true, guardians: { select: { id: true, fullName: true, email: true, userId: true, customFields: true } }, children: { select: { id: true, fullName: true, dateOfBirth: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true } }, billingAccount: { include: { invoices: { orderBy: { dueDate: "asc" } }, payments: { orderBy: { paidAt: "asc" } }, ledgerEntries: { orderBy: { effectiveAt: "asc" } } } } },
    }) : [],
    pisgah ? prisma.staffProfile.findMany({ where: { centerId: pisgah.id, OR: [{ user: { name: { contains: "Hannah", mode: "insensitive" } } }, { user: { email: { contains: "hannah", mode: "insensitive" } } }] }, select: { id: true, title: true, classroomId: true, externalId: true, customFields: true, user: { select: { id: true, name: true, email: true, isActive: true, role: true, customFields: true } } } }) : [],
    pisgah ? prisma.tuitionPlan.findMany({ where: { OR: [{ centerId: pisgah.id }, { centerId: null }] }, orderBy: [{ centerId: "desc" }, { ageGroup: "asc" }, { amountCents: "asc" }] }) : [],
    holly ? prisma.family.findMany({
      where: { centerId: holly.id, OR: [
        { guardians: { some: { AND: [{ fullName: { contains: "Danielle", mode: "insensitive" } }, { fullName: { contains: "Johnson", mode: "insensitive" } }] } } },
        { guardians: { some: { AND: [{ fullName: { contains: "Kimberly", mode: "insensitive" } }, { fullName: { contains: "Hedges", mode: "insensitive" } }] } } },
      ] },
      select: { id: true, name: true, customFields: true, guardians: { select: { id: true, fullName: true, email: true, customFields: true } }, children: { select: { id: true, fullName: true, enrollmentStatus: true, ageGroup: true, customFields: true } }, billingAccount: { include: { invoices: { orderBy: { dueDate: "asc" } }, payments: { orderBy: { paidAt: "asc" } }, ledgerEntries: { orderBy: { effectiveAt: "asc" } } } } },
    }) : [],
    kokomo ? prisma.agencyProgram.findMany({ where: { centerId: kokomo.id }, include: { authorizations: { include: { child: { select: { id: true, fullName: true } }, family: { select: { id: true, name: true } } }, orderBy: { coverageStart: "asc" } }, claims: { include: { lines: true, remittances: true }, orderBy: { servicePeriodStart: "asc" } } } }) : [],
    longmont ? prisma.family.findMany({ where: { centerId: longmont.id }, include: { ...familyInclude, children: { select: { id: true, fullName: true, enrollmentStatus: true, customFields: true } } }, orderBy: { name: "asc" } }) : [],
  ]);

  const longmontAsOf = longmontFamilies.map(familySummary);
  const longmontPositive = longmontAsOf.filter((family) => (family.account?.balanceCents ?? 0) > 0);
  const longmontCredits = longmontAsOf.filter((family) => (family.account?.balanceCents ?? 0) < 0);
  const longmontCurrent = longmontAsOf.filter((family) => family.children.some((child) => ["enrolled", "active", "current"].includes(child.enrollmentStatus.toLowerCase())));
  const longmontCurrentPositive = longmontCurrent.filter((family) => (family.account?.balanceCents ?? 0) > 0);
  const longmontCurrentCredits = longmontCurrent.filter((family) => (family.account?.balanceCents ?? 0) < 0);
  const longmontLedgerEntries = longmontAsOf.flatMap((family) => family.account
    ? family.account.ledgerEntries.map((entry) => ({ ...entry, billingAccountId: family.account!.id }))
    : []);
  const nonInvoiceChargeCentsByAccount = buildOutstandingNonInvoiceChargesByAccount(longmontLedgerEntries);
  const longmontOutstanding = longmontAsOf.flatMap((family) => {
    const account = family.account;
    if (!account) return [];
    const openInvoices = account.invoices
      .filter((invoice) => ["OPEN", "PARTIALLY_PAID", "FAILED"].includes(invoice.status))
      .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime() || left.id.localeCompare(right.id));
    const openInvoiceTotalCents = openInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
    const invoiceReceivableCents = Math.max(
      Math.max(account.balanceCents, 0) - Math.max(nonInvoiceChargeCentsByAccount.get(account.id) ?? 0, 0),
      0,
    );
    let paidAgainstOpenInvoicesCents = Math.max(openInvoiceTotalCents - invoiceReceivableCents, 0);
    return openInvoices.map((invoice) => {
      const appliedCents = Math.min(paidAgainstOpenInvoicesCents, invoice.totalCents);
      paidAgainstOpenInvoicesCents -= appliedCents;
      return { familyId: family.id, familyName: family.name, invoice, appliedCents, outstandingCents: invoice.totalCents - appliedCents };
    });
  });
  const longmontPastDue = longmontOutstanding.filter(({ invoice }) => invoice.dueDate <= new Date("2026-08-25T23:59:59.999Z"));

  console.log(JSON.stringify({
    centers,
    corpus: corpusFamilies,
    myisha: { families: myishaFamilies.map(familySummary), refundRequests: myishaRefunds },
    pisgah: { families: pisgahFamilies, staff: pisgahStaff, tuitionPlans: pisgahPlans },
    holly: hollyFamilies,
    kokomo: kokomoPrograms,
    longmont: {
      positiveBalanceTotalCents: longmontPositive.reduce((sum, family) => sum + (family.account?.balanceCents ?? 0), 0),
      creditTotalCents: longmontCredits.reduce((sum, family) => sum + Math.abs(family.account?.balanceCents ?? 0), 0),
      currentPositiveBalanceTotalCents: longmontCurrentPositive.reduce((sum, family) => sum + (family.account?.balanceCents ?? 0), 0),
      currentCreditTotalCents: longmontCurrentCredits.reduce((sum, family) => sum + Math.abs(family.account?.balanceCents ?? 0), 0),
      current: longmontCurrent,
      pastDueInvoiceTotalCents: longmontPastDue.reduce((sum, row) => sum + row.outstandingCents, 0),
      pastDueInvoices: longmontPastDue,
      positive: longmontPositive,
      credits: longmontCredits,
    },
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
