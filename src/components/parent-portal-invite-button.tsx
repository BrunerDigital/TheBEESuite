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

const inviteStatusLabel: Record<InviteStatus, string> = {
  loading: "Checking",
  missing_email: "Missing email",
  not_invited: "Not invited",
  linked: "Linked",
  invited: "Invited",
  accepted: "Provider accepted",
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
    fetch(`/api/parent/invitations?guardianId=${encodeURIComponent(guardianId)}`)
      .then(async (response) => ({ response, json: await response.json().catch(() => null) as { status?: InviteStatus } | null }))
      .then(({ response, json }) => {
        if (active && response.ok && json?.status) setInviteStatus(json.status);
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
        setStatusMessage("The provider accepted the parent feature guide, FAQ, app-install, and payment-setup email.");
        return;
      }
      setStatusMessage(
        json?.auth?.credentialCreated
          ? "The provider accepted the welcome email. It includes the login email and first-login password, ProCare transition and tuition guidance when applicable, family check, kiosk PIN, browser-install steps, and secure payment setup."
          : "The provider accepted the welcome reminder. The parent's current password was preserved; the email includes ProCare transition and tuition guidance when applicable, a forgot-password option, browser-install steps, and secure payment setup.",
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
          Before creating access or contacting the parent, BEE Suite checks the completed ProCare batch, all four source reports,
          unresolved rows, family-child links, guardian identity, email, and phone. Accepted email is tracked separately from confirmed delivery.
        </p>
        <Button disabled={isPending || !email} onClick={() => submit("invitation")} className="w-full">
          <Send data-icon="inline-start" />
          {linked ? "Resend Parent App Invite" : "Send Parent App Invite"}
        </Button>
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
