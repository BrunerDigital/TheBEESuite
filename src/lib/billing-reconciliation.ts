export type BillingReconciliationEntry = {
  billingAccountId: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number | null;
  effectiveAt: Date | string;
  invoiceId?: string | null;
  paymentId?: string | null;
};

export type BillingReconciliationAccount = {
  id: string;
  balanceCents: number;
  familyName?: string | null;
};

export type BillingAccountVariance = {
  billingAccountId: string;
  familyName: string | null;
  accountBalanceCents: number;
  ledgerBalanceCents: number;
  varianceCents: number;
};

export function buildLedgerReconciliationReport(input: {
  accounts: BillingReconciliationAccount[];
  entries: BillingReconciliationEntry[];
}) {
  let invoiceChargeCents = 0;
  let parentPaymentCreditCents = 0;
  let agencyPaymentCreditCents = 0;
  let refundCents = 0;
  let adjustmentChargeCents = 0;
  let adjustmentCreditCents = 0;
  let netLedgerActivityCents = 0;

  const latestLedgerBalanceByAccount = new Map<string, { balanceCents: number; effectiveAt: number }>();

  for (const entry of input.entries) {
    const amountCents = Number.isFinite(entry.amountCents) ? entry.amountCents : 0;
    const type = entry.type.toLowerCase();
    netLedgerActivityCents += amountCents;

    if (type === "invoice") {
      invoiceChargeCents += Math.max(amountCents, 0);
    } else if (type === "payment") {
      parentPaymentCreditCents += Math.abs(amountCents);
    } else if (type === "agency_payment") {
      agencyPaymentCreditCents += Math.abs(amountCents);
    } else if (type === "refund") {
      refundCents += Math.abs(amountCents);
    } else if (amountCents < 0) {
      adjustmentCreditCents += Math.abs(amountCents);
    } else {
      adjustmentChargeCents += amountCents;
    }

    if (entry.balanceAfterCents !== null && Number.isFinite(entry.balanceAfterCents)) {
      const effectiveAt = new Date(entry.effectiveAt).getTime();
      const previous = latestLedgerBalanceByAccount.get(entry.billingAccountId);
      if (!previous || effectiveAt >= previous.effectiveAt) {
        latestLedgerBalanceByAccount.set(entry.billingAccountId, {
          balanceCents: entry.balanceAfterCents,
          effectiveAt,
        });
      }
    }
  }

  const accountBalanceCents = input.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
  const latestLedgerBalanceCents = input.accounts.reduce((sum, account) => {
    return sum + (latestLedgerBalanceByAccount.get(account.id)?.balanceCents ?? 0);
  }, 0);
  const accountsOutOfBalance = input.accounts
    .map((account) => {
      const ledgerBalanceCents = latestLedgerBalanceByAccount.get(account.id)?.balanceCents ?? 0;
      const varianceCents = account.balanceCents - ledgerBalanceCents;
      return {
        billingAccountId: account.id,
        familyName: account.familyName ?? null,
        accountBalanceCents: account.balanceCents,
        ledgerBalanceCents,
        varianceCents,
      };
    })
    .filter((account): account is BillingAccountVariance => account.varianceCents !== 0);

  const balanceVarianceCents = accountBalanceCents - latestLedgerBalanceCents;

  return {
    totalAccounts: input.accounts.length,
    accountsWithLedgerBalance: latestLedgerBalanceByAccount.size,
    ledgerEntryCount: input.entries.length,
    invoiceChargeCents,
    parentPaymentCreditCents,
    agencyPaymentCreditCents,
    refundCents,
    adjustmentChargeCents,
    adjustmentCreditCents,
    netLedgerActivityCents,
    accountBalanceCents,
    latestLedgerBalanceCents,
    balanceVarianceCents,
    accountsOutOfBalance,
    isBalanced: balanceVarianceCents === 0 && accountsOutOfBalance.length === 0,
  };
}
