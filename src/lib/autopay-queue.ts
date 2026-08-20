import type {
  AutopayProcessingRunState,
  AutopayRunSummary,
  ProcessAutopayInput,
} from "@/lib/autopay-processing";

export const AUTOPAY_QUEUE_MAX_PAGES = 100;

type ProcessAutopayPage = (
  input: ProcessAutopayInput,
) => Promise<AutopayRunSummary>;

export type AutopayQueueSummary = AutopayRunSummary & {
  pagesProcessed: number;
  queueDrained: boolean;
};

export async function processAutopayQueue({
  input,
  processPage,
  maxPages = AUTOPAY_QUEUE_MAX_PAGES,
}: {
  input: ProcessAutopayInput;
  processPage: ProcessAutopayPage;
  maxPages?: number;
}): Promise<AutopayQueueSummary> {
  const pageLimit = Math.max(1, Math.trunc(maxPages));
  const results: AutopayRunSummary["results"] = [];
  const seenCursors = new Set<string>();
  const runState: AutopayProcessingRunState = input.runState ?? {
    availableCreditByAccountId: new Map<string, number>(),
    blockedBillingAccountIds: new Set<string>(),
  };
  let cursorInvoiceId = input.cursorInvoiceId || null;
  let pagesProcessed = 0;
  let scanned = 0;
  let eligible = 0;
  let wouldCharge = 0;
  let paid = 0;
  let processing = 0;
  let failed = 0;
  let skipped = 0;
  let totalCents = 0;
  let asOf = input.asOf?.toISOString() || new Date().toISOString();
  let hasMore = false;
  let nextCursor: string | null = null;

  while (pagesProcessed < pageLimit) {
    const page = await processPage({
      ...input,
      cursorInvoiceId,
      runState,
    });
    pagesProcessed += 1;
    asOf = page.asOf;
    scanned += page.scanned;
    eligible += page.eligible;
    wouldCharge += page.wouldCharge;
    paid += page.paid;
    processing += page.processing;
    failed += page.failed;
    skipped += page.skipped;
    totalCents += page.totalCents;
    results.push(...page.results);
    hasMore = page.hasMore;
    nextCursor = page.nextCursor;

    if (!hasMore) break;
    if (!nextCursor || nextCursor === cursorInvoiceId || seenCursors.has(nextCursor)) {
      throw new Error("Autopay queue pagination stalled before the due-invoice queue was drained.");
    }
    seenCursors.add(nextCursor);
    cursorInvoiceId = nextCursor;
  }

  if (hasMore) {
    throw new Error(`Autopay queue still has due invoices after the ${pageLimit}-page safety limit.`);
  }

  return {
    ok: true,
    dryRun: input.dryRun !== false,
    asOf,
    scanned,
    eligible,
    wouldCharge,
    paid,
    processing,
    failed,
    skipped,
    totalCents,
    hasMore,
    nextCursor,
    results,
    pagesProcessed,
    queueDrained: true,
  };
}
