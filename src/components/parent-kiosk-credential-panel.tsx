"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, KeyRound, QrCode } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardianKioskCredentialCard } from "@/components/guardian-kiosk-credential-card";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";

type Props = {
  initialCredentials: GuardianKioskCredential[];
  previewMode?: boolean;
};

export function ParentKioskCredentialPanel({ initialCredentials, previewMode = false }: Props) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const readyCredentialCount = credentials.filter((credential) => credential.qrToken).length;

  function updatePin(guardianId: string, value: string) {
    setPins((current) => ({ ...current, [guardianId]: value.replace(/\D/g, "").slice(0, 4) }));
  }

  function savePin(guardianId: string) {
    if (previewMode) return;
    const pin = pins[guardianId] ?? "";
    if (pin.length !== 4) return;
    startTransition(async () => {
      setStatus("");
      setError("");
      const response = await fetch("/api/parent/kiosk-credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId, pin }),
      });
      const json = await response.json().catch(() => null) as {
        error?: string;
        credential?: GuardianKioskCredential;
      } | null;
      if (!response.ok || !json?.credential) {
        setError(json?.error || "Family PIN could not be saved.");
        return;
      }
      setCredentials((current) => current.map((credential) => (
        credential.guardianId === guardianId ? json.credential as GuardianKioskCredential : credential
      )));
      setPins((current) => ({ ...current, [guardianId]: "" }));
      setStatus("Family PIN and QR code updated.");
    });
  }

  if (!credentials.length) return null;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="text-primary" />
              School Check-In
            </CardTitle>
            <CardDescription>
              Use your 4-Digit Family PIN or QR code at the school lobby. Your school may start your PIN with the last four digits of your phone number, and you can change it here.
            </CardDescription>
          </div>
          <Badge variant={readyCredentialCount ? "default" : "outline"}>
            {readyCredentialCount} QR code{readyCredentialCount === 1 ? "" : "s"} ready
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {credentials.map((credential) => {
            const pin = pins[credential.guardianId] ?? "";
            return (
              <div key={credential.guardianId} className="space-y-3">
                <div className="rounded-lg border bg-background/40 p-3">
                  <Label htmlFor={`parent-kiosk-pin-${credential.guardianId}`}>4-Digit Family PIN</Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id={`parent-kiosk-pin-${credential.guardianId}`}
                      value={pin}
                      onChange={(event) => updatePin(credential.guardianId, event.target.value)}
                      inputMode="numeric"
                      type="password"
                      autoComplete="one-time-code"
                      placeholder={credential.hasPin ? "Reset PIN" : "Set PIN"}
                    />
                    <Button disabled={previewMode || isPending || pin.length !== 4} onClick={() => savePin(credential.guardianId)}>
                      <KeyRound data-icon="inline-start" />
                      Save PIN
                    </Button>
                  </div>
                </div>
                <GuardianKioskCredentialCard credential={credential} previewMode={previewMode} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
