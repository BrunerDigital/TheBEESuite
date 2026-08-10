import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DATA_READINESS_CONTEXTS,
  dataReadinessContextHref,
  type DataReadinessContextKey,
} from "@/lib/data-readiness-context";

export type CountSummary = {
  actionable: number;
  total: number;
  BLOCKED: number;
  CONFIRM: number;
  FAILED: number;
};

export function DataReadinessContextBadge({
  summary,
  context,
}: {
  summary: CountSummary | null;
  context: DataReadinessContextKey | null;
}) {
  if (!summary) return null;
  const critical = summary.BLOCKED + summary.FAILED;
  const copy = context ? DATA_READINESS_CONTEXTS[context] : null;
  return (
    <Link
      href={dataReadinessContextHref(context)}
      className="hidden min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-card/65 px-3 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:flex"
      aria-label={`Open ${copy?.label ?? "Data Readiness Center"} with ${summary.actionable} actionable tasks`}
    >
      <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
      <span>{copy?.shortLabel ?? "Readiness"}</span>
      <Badge variant={critical ? "destructive" : summary.actionable ? "secondary" : "outline"}>{summary.actionable}</Badge>
    </Link>
  );
}
