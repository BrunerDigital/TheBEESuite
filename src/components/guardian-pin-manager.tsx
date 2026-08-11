"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GuardianKioskCredentialCard } from "@/components/guardian-kiosk-credential-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { kioskPathForCenter } from "@/lib/kiosk-credentials";

type Props = {
  guardianId: string;
  guardianName: string;
  familyName: string;
  centerId?: string | null;
  centerName?: string | null;
  pinSetAt?: string | Date | null;
  qrToken?: string | null;
  kioskPath?: string | null;
};

export function GuardianPinManager({
  guardianId,
  guardianName,
  familyName,
  centerId = null,
  centerName = null,
  pinSetAt,
  qrToken: initialQrToken = null,
  kioskPath = null,
}: Props) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(pinSetAt ? "PIN set" : "No PIN");
  const [pinSetAtState, setPinSetAtState] = useState<string | null>(
    pinSetAt ? new Date(pinSetAt).toISOString() : null,
  );
  const [qrToken, setQrToken] = useState(initialQrToken ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function savePin() {
    if (pin.length !== 4) {
      setError("Enter exactly 4 numbers for the Family PIN.");
      return;
    }
    startTransition(async () => {
      setError("");
      try {
        const response = await fetch("/api/guardians/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guardianId, pin }),
        });
        const json = await response.json().catch(() => null) as {
          error?: string;
          guardian?: { qrToken?: string | null; pinSetAt?: string | null };
        } | null;
        if (!response.ok) {
          setError(json?.error || "The Family PIN could not be saved. Check the 4 numbers and try again.");
          return;
        }
        setPin("");
        setQrToken(json?.guardian?.qrToken || "");
        setPinSetAtState(json?.guardian?.pinSetAt || new Date().toISOString());
        setStatus("PIN saved");
      } catch {
        setError("The Family PIN could not be saved. Check your connection and try again.");
      }
    });
  }

  const credential = {
    guardianId,
    guardianName,
    familyId: "",
    familyName,
    centerId,
    centerName,
    hasPin: Boolean(pinSetAtState),
    pinSetAt: pinSetAtState,
    qrToken: qrToken || null,
    kioskPath: kioskPath || kioskPathForCenter(centerId, "family"),
  };

  return (
    <div className="space-y-2 rounded-lg border bg-background/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{guardianName}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <KeyRound className="size-4 text-primary" aria-hidden="true" />
      </div>
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          savePin();
        }}
      >
        <Label htmlFor={`guardian-family-pin-${guardianId}`}>4-Digit Family PIN</Label>
        <div className="flex gap-2">
          <Input
            id={`guardian-family-pin-${guardianId}`}
            name={`familyPin-${guardianId}`}
            value={pin}
            onChange={(event) => {
              setError("");
              setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            maxLength={4}
            pattern="[0-9]{4}"
            spellCheck={false}
            enterKeyHint="done"
            disabled={isPending}
            placeholder="Enter 4 numbers…"
          />
          <Button type="submit" disabled={isPending || pin.length !== 4}>
            {isPending ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            {isPending ? "Saving…" : "Save PIN"}
          </Button>
        </div>
      </form>
      {status === "PIN saved" ? (
        <Alert>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{guardianName} can now use the Family PIN or QR code at the school lobby.</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <GuardianKioskCredentialCard credential={credential} />
    </div>
  );
}
