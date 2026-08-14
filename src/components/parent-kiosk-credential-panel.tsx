"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle, QrCode } from "lucide-react";
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
    setStatus("");
    setError("");
    setPins((current) => ({ ...current, [guardianId]: value.replace(/\D/g, "").slice(0, 4) }));
  }

  function savePin(guardianId: string, familyId: string) {
    if (previewMode) return;
    const pin = pins[guardianId] ?? "";
    if (pin.length !== 4) {
      setError("Enter exactly 4 numbers for the Family PIN.");
      return;
    }
    startTransition(async () => {
      setStatus("");
      setError("");
      try {
        const response = await fetch("/api/parent/kiosk-credential", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guardianId, familyId, pin }),
        });
        const json = await response.json().catch(() => null) as {
          error?: string;
          credential?: GuardianKioskCredential;
        } | null;
        if (!response.ok || !json?.credential) {
          setError(json?.error || "The Family PIN could not be saved. Check the 4 numbers and try again.");
          return;
        }
        setCredentials((current) => current.map((credential) => (
          credential.guardianId === guardianId ? json.credential as GuardianKioskCredential : credential
        )));
        setPins((current) => ({ ...current, [guardianId]: "" }));
        setStatus(`School Check-In is ready for ${json.credential.guardianName}.`);
      } catch {
        setError("The Family PIN could not be saved. Check your connection and try again.");
      }
    });
  }

  if (!credentials.length) return null;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <QrCode className="text-primary" aria-hidden="true" />
              School Check-In
            </CardTitle>
            <CardDescription>
              Use your 4-Digit Family PIN or QR code on the School Check-In screen in your school lobby. You can change your PIN below.
            </CardDescription>
          </div>
          <Badge variant={readyCredentialCount ? "default" : "outline"}>
            {readyCredentialCount
              ? `${readyCredentialCount} QR code${readyCredentialCount === 1 ? "" : "s"} ready`
              : "PIN setup needed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertTitle>Saved</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {credentials.map((credential) => {
            const pin = pins[credential.guardianId] ?? "";
            const helpId = `parent-kiosk-pin-help-${credential.guardianId}`;
            return (
              <div key={credential.guardianId} className="space-y-3">
                <form
                  className="rounded-lg border bg-background/40 p-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    savePin(credential.guardianId, credential.familyId);
                  }}
                >
                  <Label htmlFor={`parent-kiosk-pin-${credential.guardianId}`}>
                    4-Digit Family PIN for {credential.guardianName}
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id={`parent-kiosk-pin-${credential.guardianId}`}
                      name={`familyPin-${credential.guardianId}`}
                      value={pin}
                      onChange={(event) => updatePin(credential.guardianId, event.target.value)}
                      inputMode="numeric"
                      type="password"
                      autoComplete="new-password"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      spellCheck={false}
                      enterKeyHint="done"
                      disabled={previewMode || isPending}
                      aria-describedby={helpId}
                      placeholder="Enter 4 numbers…"
                    />
                    <Button type="submit" disabled={previewMode || isPending || pin.length !== 4}>
                      {isPending ? (
                        <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <KeyRound data-icon="inline-start" aria-hidden="true" />
                      )}
                      {isPending ? "Saving…" : "Save PIN"}
                    </Button>
                  </div>
                  <p id={helpId} className="mt-2 text-xs text-muted-foreground">
                    Enter exactly 4 numbers. Saving replaces the current PIN and refreshes the QR code.
                  </p>
                </form>
                <GuardianKioskCredentialCard credential={credential} previewMode={previewMode} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
