"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  submissionId: string;
  status: string;
  reviewStatus: string;
};

export function RegistrationReviewActions({ submissionId, status, reviewStatus }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [inviteParent, setInviteParent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const canReview = status !== "APPROVED";

  function review(nextStatus: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch(`/api/registration/${submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          note,
          inviteParent: nextStatus === "APPROVED" ? inviteParent : false,
        }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        parentInvite?: { ok?: boolean; error?: string };
        registrationPayment?: { required?: boolean; status?: string; invoiceNumber?: string | null };
      } | null;
      if (!response.ok) {
        setError(json?.error || "Registration review could not be saved.");
        return;
      }
      setNote("");
      setMessage(
        nextStatus === "APPROVED"
          ? json?.registrationPayment?.required
            ? json?.parentInvite?.ok
              ? `Application approved, parent portal setup was sent, and invoice ${json.registrationPayment.invoiceNumber ?? ""} is ready.`
              : `Application approved and invoice ${json.registrationPayment.invoiceNumber ?? ""} is ready. Parent portal invite still needs staff follow-up.`
            : json?.parentInvite?.ok
              ? "Application approved and parent portal setup was sent."
              : "Application approved. Parent portal invite still needs staff follow-up."
          : "Application rejected and review status was recorded.",
      );
      router.refresh();
    });
  }

  return (
    <div className="min-w-64 space-y-2">
      {canReview ? (
        <>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Director note" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              className="size-4"
              checked={inviteParent}
              onChange={(event) => setInviteParent(event.target.checked)}
              type="checkbox"
            />
            Send parent portal setup now (only after school launch approval)
          </label>
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
        <span className="text-xs text-muted-foreground">Approved</span>
      )}
      {reviewStatus !== "submitted" ? (
        <div className="text-xs text-muted-foreground">Review status: {reviewStatus}</div>
      ) : null}
      {message ? (
        <Alert>
          <Send className="size-4" />
          <AlertTitle>Review saved</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
