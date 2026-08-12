"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FileCheck2, Send, ShieldCheck, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RegistrationReviewPreview } from "@/lib/registration-packet";

type Props = {
  submissionId: string;
  status: string;
  reviewStatus: string;
  preview: RegistrationReviewPreview;
};

export function RegistrationReviewActions({ submissionId, status, reviewStatus, preview }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [inviteParent, setInviteParent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const canReview = status !== "APPROVED" && reviewStatus !== "approved";

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
          confirmed: nextStatus === "APPROVED" ? confirmed : false,
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
      setConfirmed(false);
      setOpen(false);
      setMessage(
        nextStatus === "APPROVED"
          ? json?.registrationPayment?.required
            ? json?.parentInvite?.ok
              ? `Registration confirmed, records were filed, parent portal setup was sent, and invoice ${json.registrationPayment.invoiceNumber ?? ""} is ready.`
              : `Registration confirmed, records were filed, and invoice ${json.registrationPayment.invoiceNumber ?? ""} is ready. Parent portal setup still needs staff follow-up.`
            : json?.parentInvite?.ok
              ? "Registration confirmed, records were filed, and parent portal setup was sent."
              : "Registration confirmed and records were filed. Parent portal setup still needs staff follow-up."
          : "Application rejected and review status was recorded.",
      );
      router.refresh();
    });
  }

  return (
    <div className="min-w-64 space-y-2">
      {canReview ? (
        <>
          <Dialog open={open} onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) setConfirmed(false);
          }}>
            <DialogTrigger render={<Button type="button" size="sm" />}>
              <Eye data-icon="inline-start" />
              Review & confirm
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Review submitted registration</DialogTitle>
                <DialogDescription>
                  Confirm the family’s answers and where each section will be filed. This creates the operational
                  records below and moves enrollment to documents pending; it does not mark the child finally enrolled.
                </DialogDescription>
              </DialogHeader>

              <Alert>
                <FileCheck2 className="size-4" />
                <AlertTitle>Records created or updated after confirmation</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {preview.destinations.map((destination) => (
                      <li key={destination}>• {destination}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {preview.sections.map((section) => (
                  <details key={section.id} className="rounded-lg border bg-muted/20 p-3" open={section.id === "school_program" || section.id === "guardians_billing"}>
                    <summary className="cursor-pointer font-medium">
                      {section.label}
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">
                        Files to: {section.destination}
                      </span>
                    </summary>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {section.fields.map((field) => (
                        <div key={field.key} className="min-w-0 rounded-md bg-background/70 p-2">
                          <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            {field.label}
                            {field.sensitive ? <Badge variant="outline">Restricted</Badge> : null}
                          </dt>
                          <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ))}
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Director note (optional)" aria-label="Registration review note" />
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2 text-sm">
                  <input
                    className="mt-0.5 size-5 accent-primary"
                    checked={inviteParent}
                    onChange={(event) => setInviteParent(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    Send parent portal setup now
                    <span className="block text-xs text-muted-foreground">Use only after this school’s parent launch is approved.</span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm font-medium">
                  <input
                    className="mt-0.5 size-5 accent-primary"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I reviewed the submitted information and confirm it should be filed into these family, child,
                    guardian, health, contact, and enrollment records.
                  </span>
                </label>
              </div>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Needs attention</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={isPending || !confirmed} aria-busy={isPending} onClick={() => review("APPROVED")}>
                  <ShieldCheck data-icon="inline-start" />
                  {isPending ? "Confirming…" : "Confirm registration"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button type="button" size="sm" variant="outline" disabled={isPending} aria-busy={isPending} onClick={() => review("REJECTED")}>
            <XCircle data-icon="inline-start" />
            {isPending ? "Saving…" : "Reject"}
          </Button>
        </>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4" />
          Confirmed and filed
        </span>
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
      {error && !open ? (
        <Alert variant="destructive">
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
