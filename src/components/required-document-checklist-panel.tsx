"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ClipboardCheck, FilePlus2, ListChecks, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  groupRequiredChecklistBySubject,
  requiresChecklistAction,
  type RequiredChecklistItem,
  type RequiredChecklistSummary,
} from "@/lib/required-document-checklist";

type ScopeFilter = "all" | RequiredChecklistItem["scope"];
type StatusFilter = "action" | "all" | RequiredChecklistItem["status"];

const visibleRowLimit = 160;
const visibleSubjectLimit = 80;

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

function scopeLabel(scope: RequiredChecklistItem["scope"]) {
  if (scope === "family") return "Family";
  if (scope === "child") return "Child";
  return "Staff";
}

function matchesStatusFilter(item: RequiredChecklistItem, statusFilter: StatusFilter) {
  if (statusFilter === "all") return true;
  if (statusFilter === "action") return requiresChecklistAction(item.status);
  return item.status === statusFilter;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function RequiredDocumentChecklistPanel({
  items,
  summary,
}: {
  items: RequiredChecklistItem[];
  summary: RequiredChecklistSummary;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState("");
  const [failedItems, setFailedItems] = useState<RequiredChecklistItem[]>([]);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("action");
  const [isPending, startTransition] = useTransition();

  const scopedItems = useMemo(() => (
    scopeFilter === "all" ? items : items.filter((item) => item.scope === scopeFilter)
  ), [items, scopeFilter]);
  const detailItems = useMemo(() => (
    scopedItems.filter((item) => matchesStatusFilter(item, statusFilter))
  ), [scopedItems, statusFilter]);
  const visibleItems = useMemo(() => detailItems.slice(0, visibleRowLimit), [detailItems]);
  const visibleRequestableItems = useMemo(() => (
    visibleItems.filter((item) => requiresChecklistAction(item.status))
  ), [visibleItems]);
  const allSubjectGroups = useMemo(() => groupRequiredChecklistBySubject(items), [items]);
  const subjectGroups = useMemo(() => (
    groupRequiredChecklistBySubject(scopedItems).filter((group) => (
      statusFilter === "all" || group.items.some((item) => matchesStatusFilter(item, statusFilter))
    ))
  ), [scopedItems, statusFilter]);
  const visibleSubjectGroups = useMemo(() => subjectGroups.slice(0, visibleSubjectLimit), [subjectGroups]);
  const subjectCounts = useMemo(() => ({
    family: allSubjectGroups.filter((group) => group.scope === "family").length,
    child: allSubjectGroups.filter((group) => group.scope === "child").length,
    staff: allSubjectGroups.filter((group) => group.scope === "staff").length,
  }), [allSubjectGroups]);
  const completePercent = summary.total ? Math.round((summary.complete / summary.total) * 100) : 0;

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
    return json?.mode === "existing" ? "existing" : "created";
  }

  function requestItems(targetItems: RequiredChecklistItem[], key: string) {
    startTransition(async () => {
      setMessage("");
      setError("");
      setFailedItems([]);
      setPendingKey(key);

      let created = 0;
      let existing = 0;
      const failures: Array<{ item: RequiredChecklistItem; error: unknown }> = [];

      for (const item of targetItems) {
        try {
          const mode = await requestChecklistItem(item);
          if (mode === "existing") existing += 1;
          else created += 1;
        } catch (requestError) {
          failures.push({ item, error: requestError });
        }
      }

      setPendingKey("");

      if (created || existing) {
        const createdText = created ? pluralize(created, "request") + " created" : "";
        const existingText = existing ? pluralize(existing, "request") + " already existed" : "";
        setMessage([createdText, existingText].filter(Boolean).join(". ") + ".");
        router.refresh();
      }

      if (failures.length) {
        const lastError = failures.at(-1)?.error;
        const errorText = lastError instanceof Error ? lastError.message : "Some checklist requests could not be created.";
        setFailedItems(failures.map((failure) => failure.item));
        setError(`${pluralize(failures.length, "request")} failed. ${errorText}`);
      }
    });
  }

  function createRequest(item: RequiredChecklistItem) {
    requestItems([item], item.key);
  }

  function createVisibleRequests() {
    requestItems(visibleRequestableItems, "visible");
  }

  function retryFailedRequests() {
    requestItems(failedItems, "retry");
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>
            <ClipboardCheck data-icon="inline-start" />
            Required Checklist
          </CardTitle>
          <CardDescription>
            Required family, child, and staff documentation by visible school scope.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !visibleRequestableItems.length}
          onClick={createVisibleRequests}
        >
          <ListChecks data-icon="inline-start" />
          Request visible action items
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Required</div>
            <div className="text-2xl font-semibold">{summary.total}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Complete</div>
            <div className="text-2xl font-semibold">{summary.complete}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Submitted</div>
            <div className="text-2xl font-semibold">{summary.submitted}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Requested</div>
            <div className="text-2xl font-semibold">{summary.requested}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Expired</div>
            <div className="text-2xl font-semibold">{summary.expired}</div>
          </div>
          <div className="rounded-lg border bg-background/40 p-3">
            <div className="text-xs text-muted-foreground">Action needed</div>
            <div className="text-2xl font-semibold">{summary.actionNeeded}</div>
          </div>
        </div>

        <div className="rounded-lg border bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <span className="font-medium">Checklist completion</span>
              <span className="ml-2 text-muted-foreground">
                {subjectCounts.family} families, {subjectCounts.child} children, {subjectCounts.staff} staff
              </span>
            </div>
            <span className="text-muted-foreground">{completePercent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${completePercent}%` }} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-background/40 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Scope</div>
              <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as ScopeFilter)}>
                <SelectTrigger className="h-9 sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  <SelectItem value="family">Families</SelectItem>
                  <SelectItem value="child">Children</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Status</div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                <SelectTrigger className="h-9 sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Action needed</SelectItem>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Showing {visibleItems.length} of {detailItems.length} matching rows across {subjectGroups.length} subjects.
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
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {failedItems.length ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={retryFailedRequests}
                >
                  <RotateCw data-icon="inline-start" />
                  Retry failed
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Checklist by subject</h3>
            <span className="text-xs text-muted-foreground">Completion is calculated from all requirements in the selected scope.</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status mix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSubjectGroups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell>
                      <div className="font-medium">{group.subjectName}</div>
                      <div className="text-xs text-muted-foreground">{group.items.length} required items</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{scopeLabel(group.scope)}</Badge></TableCell>
                    <TableCell>{group.centerLabel ?? "Unassigned"}</TableCell>
                    <TableCell>
                      <div className="min-w-[120px]">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span>{group.summary.complete}/{group.summary.total}</span>
                          <span className="text-muted-foreground">{group.completePercent}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${group.completePercent}%` }} />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {group.actionNeeded ? (
                        <Badge variant="destructive">{group.actionNeeded} needed</Badge>
                      ) : (
                        <Badge variant="default">Clear</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-[220px] flex-wrap gap-1">
                        {group.summary.missing ? <Badge variant="destructive">missing {group.summary.missing}</Badge> : null}
                        {group.summary.expired ? <Badge variant="destructive">expired {group.summary.expired}</Badge> : null}
                        {group.summary.rejected ? <Badge variant="destructive">rejected {group.summary.rejected}</Badge> : null}
                        {group.summary.requested ? <Badge variant="outline">requested {group.summary.requested}</Badge> : null}
                        {group.summary.submitted ? <Badge variant="outline">submitted {group.summary.submitted}</Badge> : null}
                        {group.summary.complete ? <Badge variant="secondary">complete {group.summary.complete}</Badge> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!visibleSubjectGroups.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No family, child, or staff subjects match the current checklist filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {subjectGroups.length > visibleSubjectGroups.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {visibleSubjectGroups.length} of {subjectGroups.length} matching subjects. Narrow the filters to review the rest.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Requirement rows</h3>
            <span className="text-xs text-muted-foreground">Use row actions for individual family, child, or staff document requests.</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Requirement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleItems.map((item) => (
                  <TableRow key={item.key}>
                    <TableCell>
                      <div className="font-medium">{item.subjectName}</div>
                      {item.centerLabel ? <div className="text-xs text-muted-foreground">{item.centerLabel}</div> : null}
                    </TableCell>
                    <TableCell>{scopeLabel(item.scope)}</TableCell>
                    <TableCell>{item.requirementLabel}</TableCell>
                    <TableCell><Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge></TableCell>
                    <TableCell>{formatDate(item.expiresAt)}</TableCell>
                    <TableCell>
                      {requiresChecklistAction(item.status) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isPending && (pendingKey === item.key || pendingKey === "visible" || pendingKey === "retry")}
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
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No family, child, or staff records are visible for this scope.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {detailItems.length > visibleItems.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {visibleItems.length} of {detailItems.length} matching checklist rows. Resolve visible action items first, then narrow the filters.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
