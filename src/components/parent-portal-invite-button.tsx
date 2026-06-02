"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  guardianId: string;
  guardianName: string;
  email: string | null;
  linked: boolean;
};

export function ParentPortalInviteButton({ guardianId, guardianName, email, linked }: Props) {
  const [temporaryPassword, setTemporaryPassword] = useState("");
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
        body: JSON.stringify({
          guardianId,
          temporaryPassword: temporaryPassword.trim(),
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; auth?: { passwordResetSent?: boolean } } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Parent portal access could not be created.");
        return;
      }
      setTemporaryPassword("");
      setStatusMessage(
        temporaryPassword.trim()
          ? "Parent portal access was created with the temporary password."
          : json?.auth?.passwordResetSent
            ? "Parent portal access was created and the reset email was requested."
            : "Parent portal access was created.",
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
        <div className="space-y-1">
          <Label>Temporary password</Label>
          <Input
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            placeholder="Optional; blank sends reset email"
            type="text"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to create the parent account and send a password setup/reset email.
          </p>
        </div>
        <Button disabled={isPending || !email} onClick={submit} className="w-full">
          {temporaryPassword.trim() ? <KeyRound data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          {linked ? "Reset Portal Access" : "Invite Parent"}
        </Button>
      </CardContent>
    </Card>
  );
}
