"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FilePlus2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RequiredChecklistItem, RequiredChecklistSummary } from "@/lib/required-document-checklist";

function statusVariant(status: RequiredChecklistItem["status"]) {
  if (status === "complete") return "default";
  if (status === "missing" || status === "expired" || status === "rejected") return "destructive";
  return "outline";
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

function canCreateRequest(status: RequiredChecklistItem["status"]) {
  return status === "missing" || status === "expired" || status === "rejected";
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
  const [isPending, startTransition] = useTransition();
  const visibleItems = useMemo(() => items.slice(0, 120), [items]);

  function createRequest(item: RequiredChecklistItem) {
    startTransition(async () => {
      setMessage("");
      setError("");
      setPendingKey(item.key);
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
      setPendingKey("");
      if (!response.ok) {
        setError(json?.error || "Checklist request could not be created.");
        return;
      }
      setMessage(json?.mode === "existing" ? "A matching request already exists." : "Checklist request created.");
      router.refresh();
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Required Checklist</CardTitle>
        <CardDescription>Required family, child, and staff documentation by visible school scope.</CardDescription>
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
            <div className="text-xs text-muted-foreground">Missing</div>
            <div className="text-2xl font-semibold">{summary.missing}</div>
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
                <TableCell><Badge variant={statusVariant(item.status)}>{item.status}</Badge></TableCell>
                <TableCell>{formatDate(item.expiresAt)}</TableCell>
                <TableCell>
                  {canCreateRequest(item.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending && pendingKey === item.key}
                      onClick={() => createRequest(item)}
                    >
                      <FilePlus2 data-icon="inline-start" />
                      Create Request
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">No action</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!visibleItems.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">No family, child, or staff records are visible for this scope.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
