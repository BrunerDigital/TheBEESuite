"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Globe2, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [draftSelection, setDraftSelection] = useState<WorkspaceSelectionValue | null>(workspace.selection);
  const [error, setError] = useState("");
  const appliedSelection = previewSelection ?? workspace.selection;
  const selectedCenter = draftSelection?.startsWith("center:")
    ? workspace.options.find((center) => center.id === draftSelection.slice("center:".length)) ?? null
    : null;
  const selectedTitle = draftSelection === "all" ? "All locations" : selectedCenter?.name ?? "Choose a workspace";
  const selectedDetail = draftSelection === "all"
    ? `${workspace.companyLabel} view across ${workspace.authorizedCenterCount} authorized schools.`
    : selectedCenter?.detail ?? "Select one of your authorized locations.";
  const selectionIsCurrent = Boolean(draftSelection && draftSelection === appliedSelection);

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
      <form
        className={cn("grid gap-4", !compact && "rounded-2xl border bg-card/70 p-4 shadow-sm sm:p-5")}
        onSubmit={(event) => {
          event.preventDefault();
          if (draftSelection && !selectionIsCurrent) void selectWorkspace(draftSelection);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="workspace-selection">Workspace</Label>
          <Select
            value={draftSelection ?? undefined}
            onValueChange={(value) => {
              if (!value) return;
              setDraftSelection(value as WorkspaceSelectionValue);
              setError("");
            }}
            disabled={Boolean(pendingSelection)}
          >
            <SelectTrigger
              id="workspace-selection"
              aria-describedby="workspace-selection-help"
              className="min-h-12 bg-background px-4 text-base"
            >
              <SelectValue placeholder="Choose a location" />
            </SelectTrigger>
            <SelectContent align="start">
              {workspace.canSelectAll ? (
                <SelectItem value="all">All locations — Company-wide</SelectItem>
              ) : null}
              {workspace.options.map((center) => (
                <SelectItem key={center.id} value={`center:${center.id}`}>
                  {center.name}{center.detail ? ` — ${center.detail}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id="workspace-selection-help" className="text-xs leading-5 text-muted-foreground">
            Start typing while the menu is open to jump to a location.
          </p>
        </div>

        <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-background/70 p-3" aria-live="polite">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {draftSelection === "all"
              ? <Globe2 className="size-5" aria-hidden="true" />
              : <Building2 className="size-5" aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="break-words text-sm font-semibold">{selectedTitle}</span>
              {selectionIsCurrent ? <Badge>Current</Badge> : null}
            </span>
            <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{selectedDetail}</span>
          </span>
        </div>

        <Button
          type="submit"
          className="min-h-11 w-full touch-manipulation sm:w-auto sm:justify-self-end"
          disabled={!draftSelection || Boolean(pendingSelection) || selectionIsCurrent}
        >
          {pendingSelection ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {pendingSelection
            ? "Opening…"
            : selectionIsCurrent
            ? "Current workspace"
            : workspace.required
            ? "Open workspace"
            : "Change workspace"}
        </Button>
      </form>
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
