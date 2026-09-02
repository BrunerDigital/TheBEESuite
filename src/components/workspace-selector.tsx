"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Globe2, LoaderCircle, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkspaceSelectionValue, WorkspaceState } from "@/lib/workspace-selection";
import { cn } from "@/lib/utils";

export function WorkspaceSelector({
  workspace,
  nextPath,
  compact = false,
  onSelected,
  previewMode = false,
}: {
  workspace: WorkspaceState;
  nextPath: string;
  compact?: boolean;
  onSelected?: () => void;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [pendingSelection, setPendingSelection] = useState<WorkspaceSelectionValue | null>(null);
  const [previewSelection, setPreviewSelection] = useState<WorkspaceSelectionValue | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleCenters = normalizedQuery
    ? workspace.options.filter((center) => `${center.name} ${center.detail} ${center.companyName ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : workspace.options;

  async function selectWorkspace(selection: WorkspaceSelectionValue) {
    if (previewMode) {
      setPreviewSelection(selection);
      setError("");
      return;
    }
    setPendingSelection(selection);
    setError("");
    try {
      const response = await fetch("/api/workspace/selection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selection, nextPath }),
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; nextPath?: string; error?: string };
      if (!response.ok || !result.ok || !result.nextPath) {
        setError(result.error || "The workspace could not be changed. Try again.");
        return;
      }
      onSelected?.();
      router.replace(result.nextPath);
      router.refresh();
    } catch {
      setError("The workspace could not be changed. Check your connection and try again.");
    } finally {
      setPendingSelection(null);
    }
  }

  return (
    <div className={cn("grid gap-4", compact && "gap-3")}>
      {workspace.invalidSelection ? (
        <Alert variant="destructive">
          <AlertTitle>Workspace access changed</AlertTitle>
          <AlertDescription>
            Your previous location is no longer authorized. Choose from your current locations to continue.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Workspace not changed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {workspace.options.length > 8 ? (
        <div className="grid gap-2">
          <Label htmlFor="workspace-search">Find a location</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="workspace-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by school, city, or company"
              className="min-h-11 pl-9"
            />
          </div>
        </div>
      ) : null}
      <div className={cn("grid gap-3", !compact && "md:grid-cols-2")} aria-label="Authorized workspaces">
        {workspace.canSelectAll ? (
          <WorkspaceChoice
            title="All locations"
            description={`${workspace.companyLabel} view across ${workspace.authorizedCenterCount} authorized schools.`}
            selected={previewSelection ? previewSelection === "all" : workspace.mode === "all"}
            pending={pendingSelection === "all"}
            disabled={Boolean(pendingSelection)}
            icon={<Globe2 className="size-5" aria-hidden="true" />}
            badge="Company-wide"
            onClick={() => selectWorkspace("all")}
          />
        ) : null}
        {visibleCenters.map((center) => {
          const selection = `center:${center.id}` as const;
          return (
            <WorkspaceChoice
              key={center.id}
              title={center.name}
              description={center.detail}
              selected={previewSelection ? previewSelection === selection : workspace.activeCenterId === center.id}
              pending={pendingSelection === selection}
              disabled={Boolean(pendingSelection)}
              icon={<Building2 className="size-5" aria-hidden="true" />}
              badge="Single location"
              onClick={() => selectWorkspace(selection)}
            />
          );
        })}
        {normalizedQuery && !visibleCenters.length ? (
          <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground md:col-span-2">
            No authorized locations match “{query.trim()}”. Try a school, city, or company name.
          </div>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground" aria-live="polite">
        {previewMode && previewSelection
          ? "Preview selection updated. No session or data changed."
          : pendingSelection
          ? "Changing workspace…"
          : "Your selection controls the school data shown across dashboards, reports, billing, communications, and other authorized areas."}
      </p>
    </div>
  );
}

function WorkspaceChoice({
  title,
  description,
  badge,
  icon,
  selected,
  pending,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  selected: boolean;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Card className={cn("relative transition-colors", selected ? "border-primary bg-primary/[0.06]" : "hover:border-primary/50")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
          <Badge variant={selected ? "default" : "outline"}>{selected ? "Current" : badge}</Badge>
        </div>
        <CardTitle as="h2" className="pt-2 text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant={selected ? "secondary" : "outline"}
          className="min-h-11 w-full touch-manipulation justify-center"
          disabled={disabled || selected}
          aria-pressed={selected}
          onClick={onClick}
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : selected ? <Check aria-hidden="true" /> : null}
          {pending ? "Opening…" : selected ? "Current workspace" : `Open ${title}`}
        </Button>
      </CardContent>
    </Card>
  );
}
