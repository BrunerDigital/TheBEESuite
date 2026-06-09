"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ClipboardCheck, FilePlus2, ListChecks } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requiresChecklistAction, type RequiredChecklistItem, type RequiredChecklistSummary } from "@/lib/required-document-checklist";

type Props = {
  items: RequiredChecklistItem[];
  summary: RequiredChecklistSummary;
};

function statusVariant(status: RequiredChecklistItem["status"]) {
  if (status === "complete") return "default";
  if (requiresChecklistAction(status)) return "destructive";
  return "outline";
}

function statusLabel(status: RequiredChecklistItem["status"]) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function StaffOnboardingChecklistPanel({ items, summary }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [isPending, startTransition] = useTransition();

  const requestableItems = useMemo(() => items.filter((item) => requiresChecklistAction(item.status)), [items]);
  const visibleItems = useMemo(() => {
    const rows = requestableItems.length ? requestableItems : items;
    return rows.slice(0, 120);
  }, [items, requestableItems]);
  const completePercent = summary.total ? Math.round((summary.complete / summary.total) * 100) : 0;
  const uniqueTeachers = useMemo(() => new Set(items.map((item) => item.subjectId)).size, [items]);

  async function requestChecklistItem(item: RequiredChecklistItem) {
    const response = await fetch("/api/documents/checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope: item.scope,
        subjectId: item.subjectId,
        requirementId: item.requirementId,
      }),
    });
    const json = await response.json().catch(() => null) as { error?: string; mode?: string } | null;
    if (!response.ok) {
      throw new Error(json?.error || "Checklist request could not be created.");
    }
    return json?.mode ?? "created";
  }

  function createRequest(item: RequiredChecklistItem) {
    startTransition(async () => {
      setMessage("");
      setError("");
      setPendingKey(item.key);
      try {
        const mode = await requestChecklistItem(item);
        setMessage(mode === "existing" ? "A matching staff onboarding request already exists." : "Staff onboarding request created.");
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Staff onboarding request could not be created.");
      } finally {
        setPendingKey("");
      }
    });
  }

  function createAllRequests() {
    startTransition(async () => {
      setMessage("");
      setError("");
      setPendingKey("all");
      try {
        let created = 0;
        let existing = 0;
        for (const item of requestableItems) {
          const mode = await requestChecklistItem(item);
          if (mode === "existing") existing += 1;
          else created += 1;
        }
        const existingText = existing ? ` ${existing} already existed.` : "";
        setMessage(`${created} staff onboarding request${created === 1 ? "" : "s"} created.${existingText}`);
        router.refresh();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Staff onboarding requests could not be created.");
      } finally {
        setPendingKey("");
      }
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            <ClipboardCheck data-icon="inline-start" />
            Staff Onboarding Checklist
          </CardTitle>
          <CardDescription>Required teacher documents, training, background, and certification requests from each school&apos;s saved staff credential rules.</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !requestableItems.length}
          onClick={createAllRequests}
        >
          <ListChecks data-icon="inline-start" />
          Request all missing
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Teachers</div>
            <div className="text-2xl font-semibold">{uniqueTeachers}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Complete</div>
            <div className="text-2xl font-semibold">{summary.complete}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Requested</div>
            <div className="text-2xl font-semibold">{summary.requested}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Submitted</div>
            <div className="text-2xl font-semibold">{summary.submitted}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Action needed</div>
            <div className="text-2xl font-semibold">{summary.actionNeeded}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Onboarding completion</span>
            <span className="text-muted-foreground">{completePercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completePercent}%` }} />
          </div>
        </div>

        {message ? (
          <Alert>
            <AlertTitle>Checklist updated</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Center</TableHead>
                <TableHead>Requirement</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="font-medium">{item.subjectName}</TableCell>
                  <TableCell>{item.centerLabel ?? "Unassigned"}</TableCell>
                  <TableCell>{item.requirementLabel}</TableCell>
                  <TableCell><Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge></TableCell>
                  <TableCell>{formatDate(item.expiresAt)}</TableCell>
                  <TableCell>
                    {requiresChecklistAction(item.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending && (pendingKey === item.key || pendingKey === "all")}
                        onClick={() => createRequest(item)}
                      >
                        <FilePlus2 data-icon="inline-start" />
                        Request
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">No action</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!visibleItems.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">No active teachers are visible for this scope.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        {items.length > visibleItems.length ? (
          <p className="text-xs text-muted-foreground">
            Showing {visibleItems.length} of {items.length} checklist rows. Resolve visible action items first, then refresh this view.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
