import Link from "next/link";
import { AlertTriangle, ArrowRight, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CountSummary } from "@/components/data-readiness-context-badge";
import {
  DATA_READINESS_CONTEXTS,
  dataReadinessContextHref,
  type DataReadinessContextKey,
} from "@/lib/data-readiness-context";

export function DataReadinessContextPanel({
  context,
  summary,
  loading,
}: {
  context: DataReadinessContextKey;
  summary: CountSummary | null;
  loading: boolean;
}) {
  const copy = DATA_READINESS_CONTEXTS[context];
  const critical = summary ? summary.BLOCKED + summary.FAILED : 0;
  if (summary?.actionable === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-primary/20 bg-card px-4 py-3" aria-labelledby="context-readiness-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {critical ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="context-readiness-heading" className="text-sm font-semibold">{copy.label}</h2>
              {summary ? <Badge variant={critical ? "destructive" : "secondary"}>{summary.actionable} need attention</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {summary ? `${summary.BLOCKED} blocked · ${summary.CONFIRM} need confirmation · ${summary.FAILED} failed validation` : loading ? "Loading readiness summary…" : "Summary unavailable. Open the readiness queue to retry."}
            </p>
          </div>
        </div>
        <Link href={dataReadinessContextHref(context)} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Review {copy.shortLabel}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
