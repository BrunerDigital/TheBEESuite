"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Clock, KeyRound, LogIn, LogOut, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type VerificationMethod = "pin" | "qr";
type KioskMode = "family" | "staff";

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
  verification?: { method: VerificationMethod };
  warnings?: Array<{ type: string; message: string }>;
  children: KioskChild[];
};

type StaffLookupResult = {
  staff: {
    id: string;
    name: string;
    email: string;
    title: string;
    classroom: { id: string; name: string } | null;
    clock: {
      status: "clocked_in" | "clocked_out";
      lastAction: string | null;
      lastActionAt: string | null;
      currentClockInAt: string | null;
      currentClockOutAt: string | null;
    };
  };
};

type VerifiedCredential =
  | { method: "pin"; pin: string }
  | { method: "qr"; qrToken: string };

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

function clockLabel(value?: string | null) {
  if (!value) return "No staff clock event today";
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function KioskCheckIn({ center }: Props) {
  const [kioskMode, setKioskMode] = useState<KioskMode>("family");
  const [credentialMode, setCredentialMode] = useState<VerificationMethod>("pin");
  const [pin, setPin] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [verifiedCredential, setVerifiedCredential] = useState<VerifiedCredential | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPin, setStaffPin] = useState("");
  const [staffLookup, setStaffLookup] = useState<StaffLookupResult | null>(null);
  const [staffNotes, setStaffNotes] = useState("");
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
  const credentialReady = credentialMode === "pin" ? pin.length === 4 : Boolean(qrToken.trim());
  const staffCredentialReady = Boolean(staffEmail.trim()) && staffPin.length === 4;
  const verificationLabel = verifiedCredential?.method === "qr" ? "QR scan" : "PIN";

  const reset = useCallback((nextStatus = "") => {
    setPin("");
    setQrToken("");
    setVerifiedCredential(null);
    setLookup(null);
    setStaffEmail("");
    setStaffPin("");
    setStaffLookup(null);
    setStaffNotes("");
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

  function selectKioskMode(mode: KioskMode) {
    markActivity();
    if (mode === kioskMode) return;
    reset();
    setKioskMode(mode);
  }

  function selectCredentialMode(method: VerificationMethod) {
    markActivity();
    if (method === credentialMode) return;
    setCredentialMode(method);
    setPin("");
    setQrToken("");
    setVerifiedCredential(null);
    setLookup(null);
    setSelectedIds([]);
    setSignatureName("");
    setError("");
    setStatus("");
  }

  useEffect(() => {
    const hasPrivateState = Boolean(pin || qrToken || lookup || staffEmail || staffPin || staffLookup || status || error);
    if (!hasPrivateState) return undefined;

    const timer = window.setInterval(() => {
      idleSecondsRef.current = Math.max(idleSecondsRef.current - 1, 0);
      const remaining = idleSecondsRef.current;
      setIdleSecondsRemaining(remaining);
      if (remaining <= 0) reset();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [error, lookup, pin, qrToken, reset, staffEmail, staffLookup, staffPin, status]);

  function appendDigit(digit: string) {
    markActivity();
    setError("");
    setStatus("");
    setPin((current) => (current.length >= 4 ? current : `${current}${digit}`));
  }

  function appendStaffDigit(digit: string) {
    markActivity();
    setError("");
    setStatus("");
    setStaffLookup(null);
    setStaffPin((current) => (current.length >= 4 ? current : `${current}${digit}`));
  }

  function lookupCredential() {
    markActivity();
    const credential: VerifiedCredential = credentialMode === "qr"
      ? { method: "qr", qrToken: qrToken.trim() }
      : { method: "pin", pin };
    if ((credential.method === "pin" && credential.pin.length !== 4) || (credential.method === "qr" && !credential.qrToken)) {
      setError("Enter a PIN or scan a QR code before finding a family.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: center.id,
          ...(credential.method === "qr" ? { qrToken: credential.qrToken } : { pin: credential.pin }),
        }),
      });
      const json = await response.json().catch(() => null) as ({ error?: string } & LookupResult) | null;
      if (!response.ok || !json) {
        setError(json?.error || "Credential could not be verified.");
        return;
      }
      setLookup(json);
      setVerifiedCredential(credential);
      setSelectedIds(json.children.map((child) => child.id));
      setSignatureName(json.guardian.fullName);
    });
  }

  function submit(type: "check_in" | "check_out") {
    markActivity();
    if (!verifiedCredential) {
      setError("Find the family before completing check-in or check-out.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: center.id,
          ...(verifiedCredential.method === "qr" ? { qrToken: verifiedCredential.qrToken } : { pin: verifiedCredential.pin }),
          childIds: selectedIds,
          type,
          signatureAccepted: Boolean(signatureName.trim()),
          signatureName,
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; latePickup?: boolean; pickupAuthorizationWarning?: boolean; children?: Array<{ fullName: string }> } | null;
      if (!response.ok || !json) {
        setError(json?.error || "Check-in/out could not be completed.");
        return;
      }
      reset(`${json.children?.map((child) => child.fullName).join(", ") || "Children"} ${type === "check_in" ? "checked in" : "checked out"}.${json.latePickup ? " Late pickup flagged for director review." : ""}${json.pickupAuthorizationWarning ? " Protected pickup note logged for director review." : ""}`);
    });
  }

  function lookupStaffCredential() {
    markActivity();
    if (!staffCredentialReady) {
      setError("Enter your work email and 4 digit staff code.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: center.id,
          email: staffEmail,
          pin: staffPin,
          action: "lookup",
        }),
      });
      const json = await response.json().catch(() => null) as ({ error?: string } & StaffLookupResult) | null;
      if (!response.ok || !json) {
        setError(json?.error || "Staff code could not be verified.");
        return;
      }
      setStaffLookup(json);
    });
  }

  function submitStaff(action: "clock_in" | "clock_out") {
    markActivity();
    if (!staffCredentialReady) {
      setError("Enter your work email and 4 digit staff code.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      const response = await fetch("/api/kiosk/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: center.id,
          email: staffEmail,
          pin: staffPin,
          action,
          notes: staffNotes,
        }),
      });
      const json = await response.json().catch(() => null) as ({ error?: string } & StaffLookupResult) | null;
      if (!response.ok || !json) {
        setError(json?.error || "Staff clock action could not be completed.");
        if (json?.staff) setStaffLookup(json);
        return;
      }
      reset(`${json.staff.name} ${action === "clock_in" ? "clocked in" : "clocked out"}.`);
      setKioskMode("staff");
    });
  }

  return (
    <main className="min-h-dvh select-none bg-background p-2 text-foreground sm:p-3 lg:p-4">
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-6xl flex-col gap-3 sm:min-h-[calc(100dvh-1.5rem)] lg:min-h-[calc(100dvh-2rem)]">
        <section className="rounded-2xl border bg-card/90 p-3 shadow-2xl shadow-black/20 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Badge className="mb-2">
                <ShieldCheck data-icon="inline-start" />
                Secure lobby kiosk
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">{center.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{center.place || "Parent check-in and check-out"}</p>
            </div>
            <div className="grid gap-2 rounded-2xl border bg-background/60 p-3 text-right sm:min-w-48 lg:hidden xl:grid">
              <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                Today
              </div>
              <div className="text-xl font-semibold">
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

        <div className="grid flex-1 gap-3 lg:grid-cols-[20rem_1fr] xl:grid-cols-[24rem_1fr]">
          <Card className="glass-panel">
            <CardHeader className="p-4 pb-2">
              <CardTitle>{kioskMode === "family" ? (credentialMode === "pin" ? "Enter 4 digit PIN" : "Scan QR code") : "Staff clock-in"}</CardTitle>
              <CardDescription>
                {kioskMode === "family"
                  ? credentialMode === "pin"
                    ? "Use the PIN provided by your school director."
                    : "Use the guardian QR card issued by your school director."
                  : "Use your work email and staff kiosk code."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-background/60 p-1">
                <Button type="button" variant={kioskMode === "family" ? "default" : "ghost"} onClick={() => selectKioskMode("family")}>
                  <ShieldCheck data-icon="inline-start" />
                  Family
                </Button>
                <Button type="button" variant={kioskMode === "staff" ? "default" : "ghost"} onClick={() => selectKioskMode("staff")}>
                  <UserRound data-icon="inline-start" />
                  Staff
                </Button>
              </div>

              {kioskMode === "family" ? (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-background/60 p-1">
                    <Button type="button" variant={credentialMode === "pin" ? "default" : "ghost"} onClick={() => selectCredentialMode("pin")}>
                      <KeyRound data-icon="inline-start" />
                      PIN
                    </Button>
                    <Button type="button" variant={credentialMode === "qr" ? "default" : "ghost"} onClick={() => selectCredentialMode("qr")}>
                      <QrCode data-icon="inline-start" />
                      QR
                    </Button>
                  </div>

                  {credentialMode === "pin" ? (
                    <>
                      <div className="grid grid-cols-4 gap-3">
                        {[0, 1, 2, 3].map((index) => (
                          <div key={index} className="grid aspect-square min-h-14 place-items-center rounded-2xl border bg-background/60 text-3xl font-semibold sm:min-h-16 lg:min-h-12 xl:min-h-16">
                            {pin[index] ? "•" : ""}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                          <Button key={digit} type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 xl:h-16" onClick={() => appendDigit(digit)}>
                            {digit}
                          </Button>
                        ))}
                        <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 xl:h-16" onClick={() => {
                          markActivity();
                          setPin("");
                        }}>Clear</Button>
                        <Button type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 xl:h-16" onClick={() => appendDigit("0")}>0</Button>
                        <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 xl:h-16" onClick={() => {
                          markActivity();
                          setPin((current) => current.slice(0, -1));
                        }}>Back</Button>
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-3">
                      <Label htmlFor="guardian-qr-token" className="text-base">QR scan</Label>
                      <Textarea
                        id="guardian-qr-token"
                        className="min-h-40 resize-none font-mono text-sm"
                        value={qrToken}
                        onChange={(event) => {
                          markActivity();
                          setError("");
                          setStatus("");
                          setQrToken(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            if (!isPending && qrToken.trim()) lookupCredential();
                          }
                        }}
                        placeholder="Scan QR code"
                        autoComplete="off"
                      />
                      <Button type="button" variant="outline" onClick={() => {
                        markActivity();
                        setQrToken("");
                      }}>
                        Clear QR
                      </Button>
                    </div>
                  )}

                  <Button className="h-14 w-full text-lg sm:h-16 lg:h-12 xl:h-16" disabled={isPending || !credentialReady} onClick={lookupCredential}>
                    Find Family
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="staff-email" className="text-base">Work email</Label>
                    <Input
                      id="staff-email"
                      className="h-14 text-lg"
                      value={staffEmail}
                      onChange={(event) => {
                        markActivity();
                        setError("");
                        setStatus("");
                        setStaffLookup(null);
                        setStaffEmail(event.target.value);
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="teacher@example.com"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index} className="grid aspect-square min-h-14 place-items-center rounded-2xl border bg-background/60 text-3xl font-semibold sm:min-h-16 lg:min-h-12 xl:min-h-16">
                        {staffPin[index] ? "•" : ""}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Button key={digit} type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 xl:h-16" onClick={() => appendStaffDigit(digit)}>
                        {digit}
                      </Button>
                    ))}
                    <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 xl:h-16" onClick={() => {
                      markActivity();
                      setStaffLookup(null);
                      setStaffPin("");
                    }}>Clear</Button>
                    <Button type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 xl:h-16" onClick={() => appendStaffDigit("0")}>0</Button>
                    <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 xl:h-16" onClick={() => {
                      markActivity();
                      setStaffLookup(null);
                      setStaffPin((current) => current.slice(0, -1));
                    }}>Back</Button>
                  </div>
                  <Button className="h-14 w-full text-lg sm:h-16 lg:h-12 xl:h-16" disabled={isPending || !staffCredentialReady} onClick={lookupStaffCredential}>
                    Find Staff
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader className="p-4 pb-2">
              <CardTitle>
                {kioskMode === "staff"
                  ? staffLookup
                    ? staffLookup.staff.name
                    : "Staff time clock"
                  : lookup
                    ? lookup.family.name
                    : "Select children"}
              </CardTitle>
              <CardDescription>
                {kioskMode === "staff"
                  ? staffLookup
                    ? `${staffLookup.staff.title} verified for ${center.name}.`
                    : "Staff status appears after email and code verification."
                  : lookup
                    ? `${lookup.guardian.fullName} verified by ${verificationLabel}. Choose who is arriving or leaving.`
                    : "Your children will appear after PIN or QR verification."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-72 flex-col gap-4 p-4 pt-2 lg:min-h-0">
              {kioskMode === "staff" ? (
                staffLookup ? (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border bg-background/50 p-5">
                        <div className="text-xs uppercase text-muted-foreground">Teacher</div>
                        <div className="mt-2 text-lg font-semibold">{staffLookup.staff.name}</div>
                        <div className="text-sm text-muted-foreground">{staffLookup.staff.email}</div>
                      </div>
                      <div className="rounded-2xl border bg-background/50 p-5">
                        <div className="text-xs uppercase text-muted-foreground">Classroom</div>
                        <div className="mt-2 text-lg font-semibold">{staffLookup.staff.classroom?.name ?? "Unassigned"}</div>
                        <div className="text-sm text-muted-foreground">{staffLookup.staff.title}</div>
                      </div>
                      <div className="rounded-2xl border bg-background/50 p-5">
                        <div className="text-xs uppercase text-muted-foreground">Status</div>
                        <div className="mt-2">
                          <Badge variant={staffLookup.staff.clock.status === "clocked_in" ? "default" : "outline"}>
                            {staffLookup.staff.clock.status === "clocked_in" ? "Clocked in" : "Clocked out"}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          Last event: {clockLabel(staffLookup.staff.clock.lastActionAt)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto grid gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="staff-notes" className="text-base">Notes</Label>
                        <Textarea
                          id="staff-notes"
                          className="min-h-24 resize-none"
                          value={staffNotes}
                          onChange={(event) => {
                            markActivity();
                            setStaffNotes(event.target.value);
                          }}
                          placeholder="Optional shift note"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          className="h-20 text-xl"
                          disabled={isPending || staffLookup.staff.clock.status === "clocked_in"}
                          onClick={() => submitStaff("clock_in")}
                        >
                          <LogIn data-icon="inline-start" />
                          Clock In
                        </Button>
                        <Button
                          className="h-20 text-xl"
                          variant="secondary"
                          disabled={isPending || staffLookup.staff.clock.status !== "clocked_in"}
                          onClick={() => submitStaff("clock_out")}
                        >
                          <LogOut data-icon="inline-start" />
                          Clock Out
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Staff clock events are stored on the teacher profile and written to the audit log for director review.
                    </p>
                  </>
                ) : (
                  <div className="grid flex-1 place-items-center rounded-2xl border bg-background/40 p-8 text-center">
                    <div>
                      <Label className="text-lg">Ready for staff</Label>
                      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Enter the teacher work email and staff kiosk code to view current clock status.
                      </p>
                    </div>
                  </div>
                )
              ) : lookup ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {lookup.warnings?.length ? (
                      <Alert variant="destructive" className="md:col-span-2">
                        <AlertCircle className="size-4" />
                        <AlertTitle>Front desk verification</AlertTitle>
                        <AlertDescription>{lookup.warnings[0].message}</AlertDescription>
                      </Alert>
                    ) : null}
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
                        Typed signature is stored with the verified check-in/out log.
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
                      This lobby screen only reveals child names after a valid center-specific guardian PIN or QR code is entered.
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
