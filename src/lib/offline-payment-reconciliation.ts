export type HistoricalOfflinePaymentFunding = {
  id: string;
  amountCents: number;
  postedAt: string;
};

export type HistoricalOfflineOpenInvoice = {
  id: string;
  totalCents: number;
  dueAt: string;
  createdAt: string;
};

export type HistoricalOfflinePaymentAllocation = {
  paymentId: string;
  amountCents: number;
  invoiceClosureContributionCents: number;
  remainingCents: number;
  completedInvoiceIds: string[];
};

export type HistoricalOfflineInvoiceClosure = {
  invoiceId: string;
  amountCents: number;
  completedByPaymentId: string;
};

export function planHistoricalOfflineInvoiceReconciliation(input: {
  visibleBalanceCents: number;
  payments: HistoricalOfflinePaymentFunding[];
  invoices: HistoricalOfflineOpenInvoice[];
}) {
  const payments = [...input.payments]
    .filter((payment) => payment.amountCents > 0)
    .sort((left, right) => left.postedAt.localeCompare(right.postedAt) || left.id.localeCompare(right.id));
  const invoices = [...input.invoices]
    .filter((invoice) => invoice.totalCents > 0)
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id));

  const paymentTotalCents = payments.reduce((total, payment) => total + payment.amountCents, 0);
  const openInvoiceTotalCents = invoices.reduce((total, invoice) => total + invoice.totalCents, 0);
  const unallocatedAccountCreditCents = Math.max(0, openInvoiceTotalCents - Math.max(0, input.visibleBalanceCents));
  const settlementBudgetCents = Math.min(paymentTotalCents, unallocatedAccountCreditCents);
  const allocations = new Map(payments.map((payment) => [payment.id, {
    paymentId: payment.id,
    amountCents: payment.amountCents,
    invoiceClosureContributionCents: 0,
    remainingCents: payment.amountCents,
    completedInvoiceIds: [] as string[],
  }]));

  const fundingLots: Array<{ paymentId: string; remainingCents: number }> = [];
  let remainingBudgetCents = settlementBudgetCents;
  for (const payment of payments) {
    const fundedCents = Math.min(payment.amountCents, remainingBudgetCents);
    if (fundedCents > 0) fundingLots.push({ paymentId: payment.id, remainingCents: fundedCents });
    remainingBudgetCents -= fundedCents;
  }

  const closures: HistoricalOfflineInvoiceClosure[] = [];
  let availableCents = 0;
  let nextFundingLot = 0;
  const activeLots: Array<{ paymentId: string; remainingCents: number }> = [];

  for (const invoice of invoices) {
    while (availableCents < invoice.totalCents && nextFundingLot < fundingLots.length) {
      const lot = fundingLots[nextFundingLot++];
      activeLots.push({ ...lot });
      availableCents += lot.remainingCents;
    }
    if (availableCents < invoice.totalCents) break;

    let amountToConsume = invoice.totalCents;
    let completedByPaymentId = "";
    while (amountToConsume > 0) {
      const lot = activeLots[0];
      if (!lot) throw new Error("Historical offline payment allocation lost its funding lot.");
      const consumedCents = Math.min(lot.remainingCents, amountToConsume);
      lot.remainingCents -= consumedCents;
      amountToConsume -= consumedCents;
      availableCents -= consumedCents;
      completedByPaymentId = lot.paymentId;
      const allocation = allocations.get(lot.paymentId)!;
      allocation.invoiceClosureContributionCents += consumedCents;
      allocation.remainingCents -= consumedCents;
      if (lot.remainingCents === 0) activeLots.shift();
    }

    allocations.get(completedByPaymentId)!.completedInvoiceIds.push(invoice.id);
    closures.push({ invoiceId: invoice.id, amountCents: invoice.totalCents, completedByPaymentId });
  }

  return {
    paymentTotalCents,
    openInvoiceTotalCents,
    visibleBalanceCents: input.visibleBalanceCents,
    unallocatedAccountCreditCents,
    settlementBudgetCents,
    invoiceClosureTotalCents: closures.reduce((total, closure) => total + closure.amountCents, 0),
    closures,
    paymentAllocations: payments.map((payment) => allocations.get(payment.id)!),
  };
}
