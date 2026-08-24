"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  mediaId: string;
  childName: string;
};

export function MediaReviewActions({ mediaId, childName }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function review(action: "approve" | "reject") {
    if (action === "approve") {
      const confirmed = window.confirm(
        `Approve this photo for ${childName}? This will share the photo with linked parents. Photo/video permission must already be confirmed on the child record.`,
      );
      if (!confirmed) return;
    }

    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch(`/api/parent/media-review/${mediaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const json = await response.json().catch(() => null) as { error?: string; media?: { status?: string } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Photo review could not be saved.");
        return;
      }
      setStatusMessage(action === "approve" ? "Photo approved and shared with parents." : "Photo sharing rejected.");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {statusMessage ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Review saved</AlertTitle>
          <AlertDescription>{statusMessage}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional review note for the audit trail"
        aria-label={`Review note for ${childName}`}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" disabled={isPending} aria-busy={isPending} onClick={() => review("approve")}>
          <ShieldCheck data-icon="inline-start" />
          {isPending ? "Saving review…" : "Approve and share"}
        </Button>
        <Button type="button" variant="destructive" disabled={isPending} aria-busy={isPending} onClick={() => review("reject")}>
          <XCircle data-icon="inline-start" />
          {isPending ? "Saving review…" : "Reject sharing"}
        </Button>
      </div>
    </div>
  );
}
