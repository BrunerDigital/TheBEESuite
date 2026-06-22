"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { SetupChecklistPanel } from "@/components/setup-checklist-panel";
import { directorLaunchChecklistTasks } from "@/lib/setup-checklists";
import { cn } from "@/lib/utils";

export type SchoolSetupStatus = "complete" | "in_progress" | "missing";

export type SchoolSetupCommandSection = {
  id: string;
  field: string;
  group: string;
  label: string;
  owner: string;
  href: string;
  description: string;
  placeholder: string;
  value: string;
  status: SchoolSetupStatus;
  evidence: string;
  metrics: string[];
  requiredActions: string[];
  actionLabel: string;
};

export type SchoolSetupCommandCenterData = {
  centerId: string | null;
  centerLabel: string;
  setupStatus: string;
  progress: number;
  completedSections: number;
  totalSections: number;
  blockingSections: number;
  lastCapturedAt: string | null;
  stats: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  sections: SchoolSetupCommandSection[];
  externalNeeds: string[];
  directorChecklistCompletedIds: string[];
  directorChecklistAutomaticCompletedIds?: string[];
};

const emptySections: SchoolSetupCommandSection[] = [];

function statusLabel(status: SchoolSetupStatus) {
  if (status === "complete") return "Ready";
  if (status === "in_progress") return "In progress";
  return "Needs input";
}

function statusTone(status: SchoolSetupStatus) {
  if (status === "complete") return "default";
  if (status === "in_progress") return "secondary";
  return "destructive";
}

function statusIcon(status: SchoolSetupStatus) {
  if (status === "complete") return CheckCircle2;
  if (status === "in_progress") return ClipboardCheck;
  return AlertTriangle;
}

export function SchoolSetupCommandCenter({ data }: { data: SchoolSetupCommandCenterData }) {
  const sections = data.sections ?? emptySections;
  const firstActionNeeded = sections.find((section) => section.status !== "complete") ?? sections[0];
  const [activeId, setActiveId] = useState(firstActionNeeded?.id ?? "");
  const [values, setValues] = useState(() =>
    Object.fromEntries(sections.map((section) => [section.field, section.value])),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const activeSection = sections.find((section) => section.id === activeId) ?? sections[0];
  const groups = useMemo(() => Array.from(new Set(sections.map((section) => section.group))), [sections]);

  function displayedStatus(section: SchoolSetupCommandSection): SchoolSetupStatus {
    if (section.status === "complete") return "complete";
    return values[section.field]?.trim() ? "in_progress" : section.status;
  }

  function updateValue(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function saveSetup() {
    setMessage("");
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/school-setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            centerId: data.centerId,
            sections: values,
          }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) {
          throw new Error(json?.error || "School setup could not be saved.");
        }
        setMessage("Director setup input saved.");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "School setup could not be saved.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">School setup command center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Director-facing launch checklist for turning on every BEE Suite module at {data.centerLabel}.
            </p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3 text-sm">
            <div className="font-medium">{statusLabel(data.blockingSections ? "missing" : "complete")}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {data.lastCapturedAt ? `Last saved ${data.lastCapturedAt}` : "No director setup save yet"}
            </div>
          </div>
        </div>
        <Progress value={data.progress} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Launch readiness</div>
            <div className="mt-1 text-2xl font-semibold">{data.progress}%</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Ready areas</div>
            <div className="mt-1 text-2xl font-semibold">{data.completedSections}/{data.totalSections}</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Needs input</div>
            <div className="mt-1 text-2xl font-semibold">{data.blockingSections}</div>
          </div>
          <div className="rounded-lg border bg-background/50 p-3">
            <div className="text-xs text-muted-foreground">Setup status</div>
            <div className="mt-1 text-sm font-semibold">{data.setupStatus.replaceAll("_", " ")}</div>
          </div>
        </div>
      </section>

      <SetupChecklistPanel
        checklistKey="director_launch"
        title="Director launch setup checklist"
        description="Check off each setup task as your school finishes it. This is your per-user progress tracker for the director implementation guide."
        tasks={directorLaunchChecklistTasks}
        initialCompletedIds={data.directorChecklistCompletedIds}
        automaticCompletedIds={data.directorChecklistAutomaticCompletedIds}
        graphicHref="/brand/the-bee-suite/explainers/kid-city-director-setup-roadmap.svg"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-3">
            {data.stats.map((stat) => (
              <div key={stat.label} className="rounded-lg border bg-background/50 p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-lg font-semibold">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.detail}</div>
              </div>
            ))}
          </div>

          {groups.map((group) => (
            <Card key={group} className="glass-panel">
              <CardHeader>
                <CardTitle>{group}</CardTitle>
                <CardDescription>Complete these records and director decisions before turning on the related modules.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {sections.filter((section) => section.group === group).map((section) => {
                  const status = displayedStatus(section);
                  const Icon = statusIcon(status);
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveId(section.id)}
                      className={cn(
                        "rounded-lg border bg-background/50 p-4 text-left transition hover:border-primary/50",
                        activeId === section.id && "border-primary bg-primary/10",
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Icon className="size-4 text-primary" />
                            <span className="font-semibold">{section.label}</span>
                            <Badge variant={statusTone(status)}>{statusLabel(status)}</Badge>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-muted-foreground">{section.description}</p>
                          <div className="mt-3 text-xs text-muted-foreground">{section.evidence}</div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Badge variant="outline">{section.owner}</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="flex flex-col gap-4">
          {activeSection ? (
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle>{activeSection.label}</CardTitle>
                <CardDescription>{activeSection.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  {activeSection.metrics.map((metric) => (
                    <div key={metric} className="rounded-lg border bg-background/50 p-3 text-sm">{metric}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-notes">Director input</Label>
                  <Textarea
                    id="setup-notes"
                    value={values[activeSection.field] ?? ""}
                    onChange={(event) => updateValue(activeSection.field, event.target.value)}
                    placeholder={activeSection.placeholder}
                    className="min-h-36"
                  />
                </div>
                <div className="rounded-lg border bg-background/50 p-3">
                  <div className="text-sm font-medium">Required actions</div>
                  <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                    {activeSection.requiredActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={saveSetup} disabled={isPending || !data.centerId}>
                    {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
                    Save setup input
                  </Button>
                  <Button variant="outline" nativeButton={false} render={<Link href={activeSection.href} />}>
                    <ExternalLink data-icon="inline-start" />
                    {activeSection.actionLabel}
                  </Button>
                </div>
                {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</div> : null}
                {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>What we still need from you</CardTitle>
              <CardDescription>Items the app cannot reliably infer from existing records.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {data.externalNeeds.map((need) => <li key={need}>{need}</li>)}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
