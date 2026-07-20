"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Send } from "lucide-react";
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

export function ParentPortalInviteButton({ guardianId, guardianName, email, linked }: Props) {
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      setStatusMessage("");
      setErrorMessage("");
      const response = await fetch("/api/parent/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId }),
      });
      const json = await response.json().catch(() => null) as { error?: string; auth?: { credentialCreated?: boolean } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Parent portal access could not be created.");
        return;
      }
      setStatusMessage(
        json?.auth?.credentialCreated
          ? "Parent portal access was created and a private one-time setup link was sent. The parent creates a password before finishing setup."
          : "Parent portal access was linked and a fresh private setup link was sent. The prior unused setup link is no longer valid.",
      );
    });
  }

  return (
    <Card className="glass-panel">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{guardianName}</CardTitle>
            <CardDescription>{email || "No guardian email on file"}</CardDescription>
          </div>
          <Badge variant={linked ? "default" : "outline"}>{linked ? "Linked" : "Not linked"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {statusMessage ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Portal access ready</AlertTitle>
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
          The guardian email becomes the parent login. Parents create a private password from the one-time setup link and can change it
          later from the login screen. The setup screen confirms contact details and the check-in PIN.
        </p>
        <Button disabled={isPending || !email} onClick={submit} className="w-full">
          <Send data-icon="inline-start" />
          {linked ? "Send Parent Login" : "Invite Parent"}
        </Button>
      </CardContent>
    </Card>
  );
}
