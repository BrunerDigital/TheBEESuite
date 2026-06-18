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
};

export function ParentKioskCredentialPanel({ initialCredentials }: Props) {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function updatePin(guardianId: string, value: string) {
    setPins((current) => ({ ...current, [guardianId]: value.replace(/\D/g, "").slice(0, 4) }));
  }

  function savePin(guardianId: string) {
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
        setError(json?.error || "Kiosk PIN could not be saved.");
        return;
      }
      setCredentials((current) => current.map((credential) => (
        credential.guardianId === guardianId ? json.credential as GuardianKioskCredential : credential
      )));
      setPins((current) => ({ ...current, [guardianId]: "" }));
      setStatus("Kiosk PIN and QR code updated.");
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
              Check-In PIN And QR
            </CardTitle>
            <CardDescription>Your school can start you with the last four digits of your phone number. You can save a different 4 digit PIN here.</CardDescription>
          </div>
          <Badge variant={credentials.some((credential) => credential.qrToken) ? "default" : "outline"}>
            {credentials.filter((credential) => credential.qrToken).length} ready
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
                  <Label htmlFor={`parent-kiosk-pin-${credential.guardianId}`}>4 digit kiosk PIN</Label>
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
                    <Button disabled={isPending || pin.length !== 4} onClick={() => savePin(credential.guardianId)}>
                      <KeyRound data-icon="inline-start" />
                      Save
                    </Button>
                  </div>
                </div>
                <GuardianKioskCredentialCard credential={credential} showToken={false} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
