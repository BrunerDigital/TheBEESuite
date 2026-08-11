"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, BookOpenText, CheckCircle2, Copy, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  guardianId: string;
  guardianName: string;
  email: string | null;
  linked: boolean;
};

type ManualEmailCopy = { clipboardText: string };
type InviteStatus = "loading" | "missing_email" | "not_invited" | "linked" | "invited" | "accepted" | "delivered" | "expired" | "failed";
type InviteStatusPayload = { status?: InviteStatus };

const MAX_STATUS_BATCH_SIZE = 200;
const pendingStatusRequests = new Map<string, Array<{
  resolve: (payload: InviteStatusPayload | undefined) => void;
  reject: (error: unknown) => void;
}>>();
let statusBatchScheduled = false;

async function flushStatusBatch() {
  statusBatchScheduled = false;
  const requests = new Map(pendingStatusRequests);
  pendingStatusRequests.clear();
  const guardianIds = [...requests.keys()];

  try {
    const statuses: Record<string, InviteStatusPayload> = {};
    for (let index = 0; index < guardianIds.length; index += MAX_STATUS_BATCH_SIZE) {
      const batch = guardianIds.slice(index, index + MAX_STATUS_BATCH_SIZE);
      const params = new URLSearchParams({ guardianIds: batch.join(",") });
      const response = await fetch(`/api/parent/invitations?${params.toString()}`);
      const json = await response.json().catch(() => null) as { statuses?: Record<string, InviteStatusPayload> } | null;
      if (!response.ok) throw new Error("Parent invitation statuses could not be loaded.");
      Object.assign(statuses, json?.statuses ?? {});
    }
    for (const [guardianId, waiters] of requests) {
      for (const waiter of waiters) waiter.resolve(statuses[guardianId]);
    }
  } catch (error) {
    for (const waiters of requests.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
  }
}

function loadInviteStatus(guardianId: string) {
  return new Promise<InviteStatusPayload | undefined>((resolve, reject) => {
    pendingStatusRequests.set(guardianId, [
      ...(pendingStatusRequests.get(guardianId) ?? []),
      { resolve, reject },
    ]);
    if (!statusBatchScheduled) {
      statusBatchScheduled = true;
      window.setTimeout(() => void flushStatusBatch(), 0);
    }
  });
}

const inviteStatusLabel: Record<InviteStatus, string> = {
  loading: "Checking",
  missing_email: "Missing email",
  not_invited: "Not invited",
  linked: "Linked",
  invited: "Invited",
  accepted: "Accepted for delivery",
  delivered: "Delivered",
  expired: "Expired",
  failed: "Failed",
};

export function ParentPortalInviteButton({ guardianId, guardianName, email, linked }: Props) {
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [manualCopy, setManualCopy] = useState<ManualEmailCopy | null>(null);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>(email ? "loading" : "missing_email");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!email) return;
    let active = true;
    loadInviteStatus(guardianId)
      .then((payload) => {
        if (active && payload?.status) setInviteStatus(payload.status);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [email, guardianId]);

  function submit(messageType: "invitation" | "guide") {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      setManualCopy(null);
      const response = await fetch("/api/parent/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId, messageType }),
      });
      const json = await response.json().catch(() => null) as { error?: string; auth?: { credentialCreated?: boolean }; manualCopy?: ManualEmailCopy } | null;
      setManualCopy(json?.manualCopy ?? null);
      if (!response.ok) {
        setErrorMessage(json?.error || "Parent portal access could not be created.");
        return;
      }
      if (messageType === "guide") {
        setStatusMessage("The parent guide email was accepted for delivery.");
        return;
      }
      setStatusMessage(
        json?.auth?.credentialCreated
          ? "The welcome email was accepted for delivery. It includes sign-in details, family verification, the Family PIN, Add to Home Screen steps, and payment guidance when available."
          : "The welcome reminder was accepted for delivery. The parent's current password was not changed; the email includes Forgot password, Add to Home Screen steps, and payment guidance when available.",
      );
      setInviteStatus("accepted");
    });
  }

  async function copyInvitation() {
    if (!manualCopy) return;
    try {
      await navigator.clipboard.writeText(manualCopy.clipboardText);
      setStatusMessage("Invitation copied. Paste it into your approved school email account and send it to the guardian email shown above.");
      setErrorMessage("");
    } catch {
      setErrorMessage("The invitation is ready, but the browser blocked clipboard access. Try again from a secure browser window.");
    }
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{guardianName}</CardTitle>
            <CardDescription>{email || "No guardian email on file"}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={linked ? "default" : "outline"}>{linked ? "Linked" : "Not linked"}</Badge>
            <Badge variant={inviteStatus === "failed" || inviteStatus === "expired" || inviteStatus === "missing_email" ? "destructive" : "secondary"}>
              {inviteStatusLabel[inviteStatus]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Parent email accepted</AlertTitle>
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
        <p className="text-xs leading-5 text-muted-foreground">
          Before creating access or contacting the parent, BEE Suite checks the current school and family-child links, active or pending
          enrollment, guardian identity, email, phone, and duplicate conflicts. Import history is diagnostic when present but is not required
          for a safely entered current family. Accepted email is tracked separately from confirmed delivery.
        </p>
        <Button disabled={isPending || !email} onClick={() => submit("invitation")} className="w-full">
          <Send data-icon="inline-start" />
          {linked ? "Resend Parent App Invite" : "Send Parent App Invite"}
        </Button>
        {linked ? (
          <p className="text-xs text-muted-foreground">
            This guardian is already linked. Resend sends a reminder only; their existing account and password are preserved.
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !email || !linked}
          onClick={() => submit("guide")}
          className="w-full"
        >
          <BookOpenText data-icon="inline-start" />
          Send Parent Feature Guide & FAQ
        </Button>
        {!linked ? (
          <p className="text-xs text-muted-foreground">
            Send the parent app invite first. The feature guide is available after the guardian account is linked.
          </p>
        ) : null}
        {manualCopy ? (
          <Button type="button" variant="outline" onClick={copyInvitation} className="w-full">
            <Copy data-icon="inline-start" />
            Copy Invitation for Manual Email
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
