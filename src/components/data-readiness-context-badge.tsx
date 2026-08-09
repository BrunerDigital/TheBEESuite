"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type CountSummary = {
  actionable: number;
  BLOCKED: number;
  FAILED: number;
};

export function DataReadinessContextBadge() {
  const [summary, setSummary] = useState<CountSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/data-readiness?mode=count", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; summary?: CountSummary }) => {
        if (!cancelled && result.ok && result.summary) setSummary(result.summary);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!summary) return null;
  const critical = summary.BLOCKED + summary.FAILED;
  return (
    <Link
      href="/data-readiness"
      className="hidden min-h-10 items-center gap-2 rounded-xl border border-primary/20 bg-card/65 px-3 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
      aria-label={`Open Data Readiness Center with ${summary.actionable} actionable tasks`}
    >
      <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
      <span>Readiness</span>
      <Badge variant={critical ? "destructive" : summary.actionable ? "secondary" : "outline"}>{summary.actionable}</Badge>
    </Link>
  );
}
