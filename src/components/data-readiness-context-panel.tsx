import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
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
  return (
    <section
      className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-card/75 shadow-lg shadow-black/[0.06]"
      aria-labelledby="context-readiness-heading"
    >
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            {critical ? <AlertTriangle className="size-5" aria-hidden="true" /> : summary?.actionable === 0 ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <ShieldAlert className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="context-readiness-heading" className="text-base font-semibold text-pretty">{copy.label}</h2>
              {summary ? <Badge variant={critical ? "destructive" : summary.actionable ? "secondary" : "outline"}>{summary.actionable} need attention</Badge> : <Badge variant="outline">{loading ? "Loading…" : "Unavailable"}</Badge>}
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
              {summary
                ? summary.total === 0
                  ? "No import tasks are currently listed in this area."
                  : `${summary.BLOCKED} blocked · ${summary.CONFIRM} need confirmation · ${summary.FAILED} failed validation`
                : loading
                  ? "Loading this school’s readiness summary…"
                  : "The summary could not be loaded. Open the readiness queue to retry."}
            </p>
          </div>
        </div>
        <Link
          href={dataReadinessContextHref(context)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-background/70 px-4 text-sm font-semibold transition-colors hover:border-primary/45 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Review {copy.shortLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
