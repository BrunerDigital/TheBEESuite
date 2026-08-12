export type StripeFeeReportAllocationRow = {
  accountId: string;
  balanceTransactionId: string;
  amountMinorUnits: number;
};

export type StripeFeeRecoverySource = {
  processingFeeCents: number;
  applicationFeeCents: number;
  applicationFeeRefundedCents: number;
};

function safeCents(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function retainedProcessingFeeCents(source: StripeFeeRecoverySource) {
  const processingFeeCents = safeCents(source.processingFeeCents);
  const applicationFeeCents = safeCents(source.applicationFeeCents);
  const applicationFeeRefundedCents = Math.min(
    safeCents(source.applicationFeeRefundedCents),
    applicationFeeCents,
  );
  if (processingFeeCents === 0 || applicationFeeCents === 0) return 0;
  const retainedApplicationFeeCents = applicationFeeCents - applicationFeeRefundedCents;
  return Math.min(
    processingFeeCents,
    Math.round(processingFeeCents * (retainedApplicationFeeCents / applicationFeeCents)),
  );
}

export function allocateExactStripeFees(
  rows: StripeFeeReportAllocationRow[],
  exactBalanceTransactionCents: Map<string, number>,
) {
  const allocation = new Map<string, number>();
  const grouped = new Map<string, StripeFeeReportAllocationRow[]>();
  for (const row of rows) {
    if (!row.accountId.startsWith("acct_") || !row.balanceTransactionId.startsWith("txn_")) continue;
    if (!Number.isFinite(row.amountMinorUnits) || row.amountMinorUnits <= 0) continue;
    grouped.set(row.balanceTransactionId, [...(grouped.get(row.balanceTransactionId) || []), row]);
  }

  for (const [balanceTransactionId, transactionRows] of grouped) {
    const exactCents = safeCents(exactBalanceTransactionCents.get(balanceTransactionId) || 0);
    if (exactCents === 0) throw new Error(`Missing exact Stripe amount for ${balanceTransactionId}.`);
    const rawByAccount = new Map<string, number>();
    for (const row of transactionRows) {
      rawByAccount.set(row.accountId, (rawByAccount.get(row.accountId) || 0) + row.amountMinorUnits);
    }
    const rawTotal = [...rawByAccount.values()].reduce((sum, amount) => sum + amount, 0);
    if (rawTotal <= 0) throw new Error(`Stripe report allocation is empty for ${balanceTransactionId}.`);

    const pieces = [...rawByAccount.entries()].map(([accountId, rawAmount]) => {
      const exactShare = exactCents * (rawAmount / rawTotal);
      return {
        accountId,
        cents: Math.floor(exactShare),
        remainder: exactShare - Math.floor(exactShare),
      };
    });
    const remainingCents = exactCents - pieces.reduce((sum, piece) => sum + piece.cents, 0);
    pieces.sort((left, right) =>
      right.remainder - left.remainder || left.accountId.localeCompare(right.accountId));
    for (let index = 0; index < remainingCents; index += 1) {
      pieces[index % pieces.length].cents += 1;
    }
    for (const piece of pieces) {
      allocation.set(piece.accountId, (allocation.get(piece.accountId) || 0) + piece.cents);
    }
  }

  return allocation;
}

export function schoolFeeCorrectionCents(input: {
  actualStripeFeeCents: number;
  retainedProcessingFeeCents: number;
  priorCorrectionCents: number;
}) {
  return Math.max(
    0,
    safeCents(input.actualStripeFeeCents)
      - safeCents(input.retainedProcessingFeeCents)
      - safeCents(input.priorCorrectionCents),
  );
}
