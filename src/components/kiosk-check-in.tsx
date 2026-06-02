"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Clock, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KioskChild = {
  id: string;
  fullName: string;
  preferredName: string | null;
  ageGroup: string;
  classroom: { id: string; name: string } | null;
  lastAction: { type: string; occurredAt: string | Date } | null;
};

type LookupResult = {
  guardian: { id: string; fullName: string; relation: string };
  family: { id: string; name: string };
  children: KioskChild[];
};

type Props = {
  center: {
    id: string;
    name: string;
    place: string;
  };
};

const idleResetSeconds = 45;

function actionLabel(type?: string) {
  if (type === "check_in") return "Checked in";
  if (type === "check_out") return "Checked out";
  return "No kiosk action today";
}

export function KioskCheckIn({ center }: Props) {
  const [pin, setPin] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [signatureName, setSignatureName] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const idleSecondsRef = useRef(idleResetSeconds);
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(idleResetSeconds);
  const [isPending, startTransition] = useTransition();
  const selectedChildren = useMemo(
    () => lookup?.children.filter((child) => selectedIds.includes(child.id)) ?? [],
    [lookup, selectedIds],
  );

  const reset = useCallback((nextStatus = "") => {
    setPin("");
    setLookup(null);
    setSelectedIds([]);
    setSignatureName("");
    setError("");
    setStatus(nextStatus);
    idleSecondsRef.current = idleResetSeconds;
    setIdleSecondsRemaining(idleResetSeconds);
  }, []);

  function markActivity() {
    idleSecondsRef.current = idleResetSeconds;
    setIdleSecondsRemaining(idleResetSeconds);
  }

  useEffect(() => {
    const hasPrivateState = Boolean(pin || lookup || status || error);
    if (!hasPrivateState) return undefined;

    const timer = window.setInterval(() => {
      idleSecondsRef.current = Math.max(idleSecondsRef.current - 1, 0);
      const remaining = idleSecondsRef.current;
      setIdleSecondsRemaining(remaining);
      if (remaining <= 0) reset();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [error, lookup, pin, reset, status]);

  function appendDigit(digit: string) {
    markActivity();
    setError("");
    setStatus("");
    setPin((current) => (current.length >= 4 ? current : `${current}${digit}`));
  }

  function lookupPin() {
    markActivity();
    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: center.id, pin }),
      });
      const json = await response.json().catch(() => null) as ({ error?: string } & LookupResult) | null;
      if (!response.ok || !json) {
        setError(json?.error || "PIN could not be verified.");
        return;
      }
      setLookup(json);
      setSelectedIds(json.children.map((child) => child.id));
      setSignatureName(json.guardian.fullName);
    });
  }

  function submit(type: "check_in" | "check_out") {
    markActivity();
    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: center.id,
          pin,
          childIds: selectedIds,
          type,
          signatureAccepted: Boolean(signatureName.trim()),
          signatureName,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; latePickup?: boolean; children?: Array<{ fullName: string }> } | null;
      if (!response.ok || !json) {
        setError(json?.error || "Check-in/out could not be completed.");
        return;
      }
      reset(`${json.children?.map((child) => child.fullName).join(", ") || "Children"} ${type === "check_in" ? "checked in" : "checked out"}.${json.latePickup ? " Late pickup flagged for director review." : ""}`);
    });
  }

  return (
    <main className="min-h-screen select-none bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-5">
        <section className="rounded-3xl border bg-card/90 p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-3">
                <ShieldCheck data-icon="inline-start" />
                Secure lobby kiosk
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{center.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">{center.place || "Parent check-in and check-out"}</p>
            </div>
            <div className="grid gap-3 rounded-2xl border bg-background/60 p-4 text-right">
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                Today
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}
              </div>
              <Badge variant="outline" className="justify-center">
                Auto-reset {idleSecondsRemaining}s
              </Badge>
              <Button variant="outline" size="sm" onClick={() => reset()}>
                Start over
              </Button>
            </div>
          </div>
        </section>

        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertTitle>Complete</AlertTitle>
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

        <div className="grid flex-1 gap-5 lg:grid-cols-[24rem_1fr]">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Enter 4 digit PIN</CardTitle>
              <CardDescription>Use the PIN provided by your school director.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="grid aspect-square min-h-20 place-items-center rounded-2xl border bg-background/60 text-4xl font-semibold">
                    {pin[index] ? "•" : ""}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                  <Button key={digit} type="button" variant="outline" className="h-20 text-3xl" onClick={() => appendDigit(digit)}>
                    {digit}
                  </Button>
                ))}
                <Button type="button" variant="outline" className="h-20 text-xl" onClick={() => {
                  markActivity();
                  setPin("");
                }}>Clear</Button>
                <Button type="button" variant="outline" className="h-20 text-3xl" onClick={() => appendDigit("0")}>0</Button>
                <Button type="button" variant="outline" className="h-20 text-xl" onClick={() => {
                  markActivity();
                  setPin((current) => current.slice(0, -1));
                }}>Back</Button>
              </div>
              <Button className="h-16 w-full text-xl" disabled={isPending || pin.length !== 4} onClick={lookupPin}>
                Find Family
              </Button>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>{lookup ? lookup.family.name : "Select children"}</CardTitle>
              <CardDescription>
                {lookup ? `${lookup.guardian.fullName} verified by PIN. Choose who is arriving or leaving.` : "Your children will appear after PIN verification."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-96 flex-col gap-4">
              {lookup ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {lookup.children.map((child) => {
                      const checked = selectedIds.includes(child.id);
                      return (
                        <label key={child.id} className={`rounded-2xl border p-5 transition ${checked ? "border-primary bg-primary/10" : "bg-background/40"}`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 size-7 accent-primary"
                              checked={checked}
                              onChange={(event) => {
                                markActivity();
                                setSelectedIds((current) => event.currentTarget.checked
                                  ? [...new Set([...current, child.id])]
                                  : current.filter((id) => id !== child.id));
                              }}
                            />
                            <div>
                              <div className="text-lg font-semibold">{child.preferredName || child.fullName}</div>
                              <div className="text-sm text-muted-foreground">{child.classroom?.name ?? "No classroom"} · {child.ageGroup}</div>
                              <div className="mt-2 text-xs text-muted-foreground">{actionLabel(child.lastAction?.type)}</div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-auto grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="signature-name" className="text-base">Guardian signature</Label>
                      <Input
                        id="signature-name"
                        className="h-14 text-lg"
                        value={signatureName}
                        onChange={(event) => {
                          markActivity();
                          setSignatureName(event.target.value);
                        }}
                        placeholder="Type full name"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground">
                        Typed signature is stored with the PIN-verified check-in/out log.
                      </p>
                    </div>
                    <Button className="h-20 text-xl" disabled={isPending || !selectedChildren.length || !signatureName.trim()} onClick={() => submit("check_in")}>
                      <LogIn data-icon="inline-start" />
                      Check In
                    </Button>
                    <Button className="h-20 text-xl" variant="secondary" disabled={isPending || !selectedChildren.length || !signatureName.trim()} onClick={() => submit("check_out")}>
                      <LogOut data-icon="inline-start" />
                      Check Out
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By tapping check in or check out, the guardian confirms the selected children are arriving or leaving with the verified adult.
                  </p>
                </>
              ) : (
                <div className="grid flex-1 place-items-center rounded-2xl border bg-background/40 p-8 text-center">
                  <div>
                    <Label className="text-lg">Ready for families</Label>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                      This lobby screen only reveals child names after a valid center-specific guardian PIN is entered.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
