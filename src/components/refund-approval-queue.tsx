"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ExecutiveRefundRequest = {
  id: string;
  centerId: string;
  schoolName: string;
  familyId: string;
  familyName: string;
  amountCents: number;
  reason: string;
  paymentReferenceCount: number;
  requestedBy: string;
  requestedAt: string;
  failureReason: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function requestedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Requested recently"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

export function RefundApprovalQueue({ requests: initialRequests }: { requests: ExecutiveRefundRequest[] }) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function review(request: ExecutiveRefundRequest, action: "approve" | "deny") {
    const reason = (decisionReasons[request.id] ?? "").trim();
    if (reason.length < 3) {
      setError("Enter a reason before approving or denying the refund.");
      return;
    }

    startTransition(async () => {
      setActiveRequestId(request.id);
      setMessage("");
      setError("");
      try {
        const response = await fetch(`/api/billing/refund-requests/${encodeURIComponent(request.id)}/review`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason }),
        });
        const json = await response.json().catch(() => null) as {
          error?: string;
          totalCents?: number;
          warning?: string | null;
        } | null;
        if (!response.ok) {
          setError(json?.error || "The refund decision could not be saved.");
          return;
        }

        setRequests((current) => current.filter((item) => item.id !== request.id));
        setDecisionReasons((current) => {
          const next = { ...current };
          delete next[request.id];
          return next;
        });
        setMessage(
          action === "approve"
            ? `${money(json?.totalCents ?? request.amountCents)} refund approved and processed.${json?.warning ? ` ${json.warning}` : ""}`
            : `${money(request.amountCents)} refund request denied. The director was notified with your reason.`,
        );
        router.refresh();
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : "The refund decision could not be saved.");
      } finally {
        setActiveRequestId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {message ? (
        <Alert>
          <CheckCircle2 data-icon="inline-start" />
          <AlertTitle>Decision saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <XCircle data-icon="inline-start" />
          <AlertTitle>Refund review needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {requests.length ? requests.map((request) => {
        const requestPending = isPending && activeRequestId === request.id;
        return (
          <div key={request.id} className="space-y-3 rounded-xl border bg-background/45 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold">{request.familyName} · {money(request.amountCents)}</div>
                <p className="text-sm text-muted-foreground">{request.schoolName} · requested by {request.requestedBy}</p>
                <p className="text-xs text-muted-foreground">{requestedLabel(request.requestedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Pending executive approval</Badge>
                {request.paymentReferenceCount ? <Badge variant="secondary">{request.paymentReferenceCount} payment reference{request.paymentReferenceCount === 1 ? "" : "s"}</Badge> : null}
              </div>
            </div>
            <div className="rounded-lg border bg-card/50 p-3 text-sm">
              <span className="font-medium">Director reason:</span> {request.reason}
            </div>
            {request.failureReason ? (
              <Alert variant="destructive">
                <AlertTitle>Last processing attempt failed</AlertTitle>
                <AlertDescription>{request.failureReason}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor={`refund-decision-${request.id}`}>Executive approval or denial reason</Label>
              <Textarea
                id={`refund-decision-${request.id}`}
                value={decisionReasons[request.id] ?? ""}
                onChange={(event) => setDecisionReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                placeholder="Record why this refund is approved or denied for the audit trail"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={requestPending} onClick={() => review(request, "approve")}>
                <CheckCircle2 data-icon="inline-start" />
                Approve and Issue Refund
              </Button>
              <Button disabled={requestPending} variant="destructive" onClick={() => review(request, "deny")}>
                <XCircle data-icon="inline-start" />
                Deny Refund
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/billing-invoices?familyId=${encodeURIComponent(request.familyId)}&centerId=${encodeURIComponent(request.centerId)}`} />}>
                <ExternalLink data-icon="inline-start" />
                Open Account and Ledger
              </Button>
            </div>
          </div>
        );
      }) : (
        <p className="rounded-xl border bg-background/40 p-4 text-sm text-muted-foreground">
          No refund requests are waiting for executive review.
        </p>
      )}
    </div>
  );
}
