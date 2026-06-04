"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DocumentReviewActions({ documentId, status }: { documentId: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const canReview = status === "SUBMITTED" || status === "REQUESTED" || status === "REJECTED";

  function review(nextStatus: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      setMessage("");
      const response = await fetch(`/api/documents/${documentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, note }),
      });
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setMessage(json?.error || "Document review could not be saved.");
        return;
      }
      setNote("");
      setMessage(nextStatus === "APPROVED" ? "Approved" : "Rejected");
      router.refresh();
    });
  }

  return (
    <div className="min-w-52 space-y-2">
      {canReview ? (
        <>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review note" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isPending} onClick={() => review("APPROVED")}>
              <CheckCircle2 data-icon="inline-start" />
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => review("REJECTED")}>
              <XCircle data-icon="inline-start" />
              Reject
            </Button>
          </div>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">No review action</span>
      )}
      {message ? <div className="text-xs text-muted-foreground">{message}</div> : null}
    </div>
  );
}
