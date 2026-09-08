"use client";

import { useState } from "react";
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type PrivacyDeletionQueueRow = {
  id: string;
  status: string;
  createdAt: Date | string;
  dueAt: Date | string | null;
  fingerprint: string;
  retentionNoticeAccepted: boolean;
  tenant: { name: string };
  center: { name: string; crmLocationId: string | null } | null;
  family: { name: string } | null;
  guardian: { fullName: string; email: string | null } | null;
  user: { email: string; role: string; isActive: boolean } | null;
};

function dateLabel(value: Date | string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PrivacyDeletionQueue({ rows }: { rows: PrivacyDeletionQueueRow[] }) {
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");

  async function submit(row: PrivacyDeletionQueueRow, action: "approve" | "execute") {
    const phrase = action === "approve" ? `APPROVE ${row.fingerprint}` : `DELETE LOGIN ${row.fingerprint}`;
    if (action === "approve" && !window.confirm("Confirm that the school reviewed required childcare, safety, billing, payment, and audit retention before approving this request.")) return;
    const confirmation = window.prompt(`Type exactly: ${phrase}`)?.trim() ?? "";
    if (confirmation !== phrase) {
      setMessage("No change was made because the confirmation phrase did not match.");
      return;
    }
    setWorkingId(row.id);
    setMessage("");
    try {
      const response = await fetch(`/api/privacy/deletion-requests/${encodeURIComponent(row.id)}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmation, schoolRetentionReviewConfirmed: action === "approve" }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Privacy request could not be updated.");
      setMessage(action === "approve" ? "Request approved. A separate exact confirmation is still required to delete the login." : "Login deletion completed and retained records were preserved.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Privacy request could not be updated.");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <Card className="glass-panel border-amber-500/35">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2"><ShieldCheck className="size-5 text-amber-500" />Account-deletion review</CardTitle>
        <CardDescription>Parent login deletion is a two-stage, audited action. Childcare, safety, billing, payment, and audit history remains intact.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message ? <div className="rounded-lg border bg-background/60 p-3 text-sm" role="status">{message}</div> : null}
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border bg-background/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{row.guardian?.fullName ?? "Parent account"}</div>
                <div className="break-all text-xs text-muted-foreground">{row.user?.email ?? row.guardian?.email ?? "Login not linked"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{row.family?.name ?? "Family unavailable"} · {row.center?.name ?? "School unavailable"} · {row.tenant.name} · requested {dateLabel(row.createdAt)} · due {dateLabel(row.dueAt)}</div>
              </div>
              <div className="flex flex-wrap gap-2"><Badge variant="outline">{row.status.replaceAll("_", " ")}</Badge><Badge variant="secondary">{row.fingerprint}</Badge></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {["verified", "school_review"].includes(row.status) ? (
                <Button type="button" variant="outline" disabled={workingId === row.id || !row.retentionNoticeAccepted} onClick={() => void submit(row, "approve")}>
                  {workingId === row.id ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <ShieldCheck />}
                  Approve after retention review
                </Button>
              ) : null}
              {["approved", "executing", "partially_completed"].includes(row.status) ? (
                <Button type="button" variant="destructive" disabled={workingId === row.id} onClick={() => void submit(row, "execute")}>
                  {workingId === row.id ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Trash2 />}
                  {row.status === "executing" ? "Resume deletion if stale" : "Delete parent login and close"}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {!rows.length ? <p className="text-sm text-muted-foreground">No open parent account-deletion requests require platform action.</p> : null}
      </CardContent>
    </Card>
  );
}
