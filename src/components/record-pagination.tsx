import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import type { LinkedRecordPagination } from "@/lib/record-pagination";

export function RecordPaginationNav({ pagination, label }: { pagination: LinkedRecordPagination; label: string }) {
  return (
    <nav aria-label={`${label} pages`} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
      <p className="text-muted-foreground">{pagination.from}–{pagination.to} of {pagination.total} {label.toLowerCase()}</p>
      {pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {pagination.previousHref ? <Link className={buttonVariants({ variant: "outline" })} href={pagination.previousHref} prefetch={false}>Previous<span className="sr-only"> {label.toLowerCase()}</span></Link> : null}
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          {pagination.nextHref ? <Link className={buttonVariants({ variant: "outline" })} href={pagination.nextHref} prefetch={false}>Next<span className="sr-only"> {label.toLowerCase()}</span></Link> : null}
        </div>
      ) : null}
    </nav>
  );
}
