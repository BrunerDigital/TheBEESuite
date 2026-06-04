"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Copy, KeyRound, QrCode } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  guardianId: string;
  guardianName: string;
  pinSetAt?: string | Date | null;
};

export function GuardianPinManager({ guardianId, guardianName, pinSetAt }: Props) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(pinSetAt ? "PIN set" : "No PIN");
  const [qrToken, setQrToken] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function savePin() {
    startTransition(async () => {
      setError("");
      const response = await fetch("/api/guardians/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianId, pin }),
      });
      const json = await response.json().catch(() => null) as { error?: string; guardian?: { qrToken?: string | null } } | null;
      if (!response.ok) {
        setError(json?.error || "PIN could not be saved.");
        return;
      }
      setPin("");
      setQrToken(json?.guardian?.qrToken || "");
      setStatus("PIN saved");
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{guardianName}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <KeyRound className="size-4 text-primary" />
      </div>
      <div className="flex gap-2">
        <Input
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="4 digit PIN"
          aria-label={`Set kiosk PIN for ${guardianName}`}
        />
        <Button disabled={isPending || pin.length !== 4} onClick={savePin}>
          Save
        </Button>
      </div>
      {status === "PIN saved" ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>This guardian can use the lobby kiosk by PIN or QR scan.</AlertDescription>
        </Alert>
      ) : null}
      {qrToken ? (
        <div className="space-y-2 rounded-md border bg-background/50 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <QrCode className="size-4" />
              QR scan payload
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void navigator.clipboard?.writeText(qrToken)}
            >
              <Copy data-icon="inline-start" />
              Copy
            </Button>
          </div>
          <Textarea
            readOnly
            value={qrToken}
            aria-label={`QR scan payload for ${guardianName}`}
            className="max-h-28 min-h-20 resize-none font-mono text-xs"
          />
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
