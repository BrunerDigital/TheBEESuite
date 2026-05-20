"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, KeyRound, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  guardianId: string;
  guardianName: string;
  pinSetAt?: string | Date | null;
};

export function GuardianPinManager({ guardianId, guardianName, pinSetAt }: Props) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(pinSetAt ? "PIN set" : "No PIN");
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
      const json = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "PIN could not be saved.");
        return;
      }
      setPin("");
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
          <AlertDescription>This guardian can use the lobby kiosk.</AlertDescription>
        </Alert>
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
