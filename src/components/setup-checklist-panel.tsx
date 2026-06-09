"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowUpRight, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { SetupChecklistKey, SetupChecklistTask } from "@/lib/setup-checklists";
import { cn } from "@/lib/utils";

type Props = {
  checklistKey: SetupChecklistKey;
  title: string;
  description: string;
  tasks: SetupChecklistTask[];
  initialCompletedIds?: string[];
  guideHref?: string;
  graphicHref?: string;
  compact?: boolean;
};

export function SetupChecklistPanel({
  checklistKey,
  title,
  description,
  tasks,
  initialCompletedIds = [],
  guideHref,
  graphicHref,
  compact = false,
}: Props) {
  const [completedIds, setCompletedIds] = useState(() => new Set(initialCompletedIds));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const completedCount = tasks.filter((task) => completedIds.has(task.id)).length;
  const progress = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  const completedList = useMemo(() => Array.from(completedIds), [completedIds]);

  function persist(nextIds: Set<string>) {
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/setup-checklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: checklistKey,
          completedIds: Array.from(nextIds),
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setCompletedIds(new Set(completedList));
        setError(json?.error || "Checklist progress could not be saved.");
      }
    });
  }

  function toggle(taskId: string) {
    const next = new Set(completedIds);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
    }
    setCompletedIds(next);
    persist(next);
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Setup</Badge>
              <Badge variant={progress === 100 ? "default" : "outline"}>{completedCount}/{tasks.length} complete</Badge>
              {isPending ? <Badge variant="outline"><Loader2 data-icon="inline-start" className="animate-spin" />Saving</Badge> : null}
            </div>
            <CardTitle className="mt-3">{title}</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">{description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {guideHref ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={guideHref} target="_blank" />}>
                <FileText data-icon="inline-start" />
                Guide
              </Button>
            ) : null}
            {graphicHref ? (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={graphicHref} target="_blank" />}>
                <ArrowUpRight data-icon="inline-start" />
                Roadmap
              </Button>
            ) : null}
          </div>
        </div>
        <Progress value={progress} />
      </CardHeader>
      <CardContent className={cn("grid gap-3", compact ? "md:grid-cols-2" : "xl:grid-cols-2")}>
        {tasks.map((task, index) => {
          const done = completedIds.has(task.id);
          return (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-background/50 p-3 transition",
                done && "border-primary/40 bg-primary/10",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(task.id)}
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold transition",
                  done ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary",
                )}
                aria-pressed={done}
                aria-label={`${done ? "Mark incomplete" : "Mark complete"}: ${task.title}`}
              >
                {done ? <CheckCircle2 className="size-4" /> : index + 1}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className={cn("text-sm font-medium", done && "text-primary")}>{task.title}</div>
                  {done ? <Badge variant="default">Done</Badge> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p>
                {task.href ? (
                  <Link href={task.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Open step
                    <ArrowUpRight className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive xl:col-span-2">
            {error}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

