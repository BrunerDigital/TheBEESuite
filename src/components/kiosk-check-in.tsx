"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Clock, CreditCard, KeyRound, LogIn, LogOut, QrCode, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { updateKioskChildSelection } from "@/lib/kiosk-child-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { IScannerControls } from "@zxing/browser";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

type VerificationMethod = "pin" | "qr";
type KioskMode = "family" | "staff";
type CameraState = "idle" | "starting" | "scanning" | "unavailable";
type PendingAction = "family_lookup" | "family_check_in" | "family_check_out" | "staff_lookup" | "staff_clock_in" | "staff_clock_out";

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
  billing?: {
    balanceCents: number;
    amountDueCents: number;
    nextInvoiceNumber: string | null;
    nextInvoiceTotalCents: number;
    nextInvoiceDueDate: string | Date | null;
    paymentUrl: string;
    paymentLabel: string;
    message: string;
  } | null;
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
  initialMode?: KioskMode;
  familyOnly?: boolean;
  previewMode?: boolean;
  center: {
    id: string;
    name: string;
    place: string;
    timeZone: string;
  };
};

const idleResetSeconds = 45;

function actionLabel(type?: string) {
  if (type === "check_in") return "Currently checked in";
  if (type === "check_out") return "Currently checked out";
  return "Not checked in today";
}

function clockLabel(value: string | null | undefined, timeZone: string) {
  return formatZonedDateTime(value, timeZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "No staff clock event today");
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function shortDate(value?: string | Date | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

async function postKioskJson<T>(path: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null) as T | null;
    return { response, json, networkError: false as const };
  } catch {
    return { response: null, json: null, networkError: true as const };
  }
}

export function KioskCheckIn({ center, initialMode = "family", familyOnly = false, previewMode = false }: Props) {
  const [kioskMode, setKioskMode] = useState<KioskMode>(familyOnly ? "family" : initialMode);
  const [credentialMode, setCredentialMode] = useState<VerificationMethod>("pin");
  const [pin, setPin] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraAttempt, setCameraAttempt] = useState(0);
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const idleSecondsRef = useRef(idleResetSeconds);
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrControlsRef = useRef<IScannerControls | null>(null);
  const qrScanHandledRef = useRef(false);
  const [idleSecondsRemaining, setIdleSecondsRemaining] = useState(idleResetSeconds);
  const [isPending, startTransition] = useTransition();
  const selectedChildren = useMemo(
    () => lookup?.children.filter((child) => selectedIds.includes(child.id)) ?? [],
    [lookup, selectedIds],
  );
  const staffCredentialReady = staffPin.length === 4;
  const verificationLabel = verifiedCredential?.method === "qr" ? "QR scan" : "PIN";
  const staffIsClockedIn = staffLookup?.staff.clock.status === "clocked_in";
  const activeKioskMode: KioskMode = familyOnly ? "family" : kioskMode;
  const canCheckInSelected = selectedChildren.length > 0
    && selectedChildren.every((child) => child.lastAction?.type !== "check_in");
  const canCheckOutSelected = selectedChildren.length > 0
    && selectedChildren.every((child) => child.lastAction?.type === "check_in");
  const selectedActionMessage = selectedChildren.length === 0
    ? "Select at least 1 child to continue."
    : canCheckInSelected
      ? `${selectedChildren.length} selected ${selectedChildren.length === 1 ? "child is" : "children are"} ready to check in.`
      : canCheckOutSelected
        ? `${selectedChildren.length} selected ${selectedChildren.length === 1 ? "child is" : "children are"} ready to check out.`
        : "The selected children have different check-in states. Select only children who are arriving or only children who are leaving.";
  const hasPrivateState = Boolean(
    pin
    || qrToken
    || lookup
    || staffEmail
    || staffPin
    || staffLookup
    || status
    || error
    || credentialMode !== "pin"
    || cameraState !== "idle",
  );

  const reset = useCallback((nextStatus = "") => {
    qrControlsRef.current?.stop();
    qrControlsRef.current = null;
    qrScanHandledRef.current = false;
    setPin("");
    setQrToken("");
    setCredentialMode("pin");
    setCameraState("idle");
    setCameraMessage("");
    setCameraAttempt((current) => current + 1);
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
    setPendingAction(null);
    idleSecondsRef.current = idleResetSeconds;
    setIdleSecondsRemaining(idleResetSeconds);
  }, []);

  function markActivity() {
    idleSecondsRef.current = idleResetSeconds;
    setIdleSecondsRemaining(idleResetSeconds);
  }

  function selectKioskMode(mode: KioskMode) {
    if (familyOnly && mode !== "family") return;
    markActivity();
    if (mode === activeKioskMode) return;
    reset();
    setKioskMode(mode);
  }

  function selectCredentialMode(method: VerificationMethod) {
    markActivity();
    if (method === credentialMode) return;
    setCredentialMode(method);
    setPin("");
    setQrToken("");
    qrControlsRef.current?.stop();
    qrControlsRef.current = null;
    qrScanHandledRef.current = false;
    setCameraState("idle");
    setCameraMessage("");
    setVerifiedCredential(null);
    setLookup(null);
    setSelectedIds([]);
    setSignatureName("");
    setError("");
    setStatus("");
  }

  useEffect(() => {
    if (!hasPrivateState) return undefined;

    const timer = window.setInterval(() => {
      idleSecondsRef.current = Math.max(idleSecondsRef.current - 1, 0);
      const remaining = idleSecondsRef.current;
      setIdleSecondsRemaining(remaining);
      if (remaining <= 0) reset();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hasPrivateState, reset]);

  useEffect(() => {
    function clearPrivateState() {
      reset();
    }

    function clearRestoredPrivateState(event: PageTransitionEvent) {
      if (event.persisted) reset();
    }

    window.addEventListener("pagehide", clearPrivateState);
    window.addEventListener("pageshow", clearRestoredPrivateState);
    return () => {
      window.removeEventListener("pagehide", clearPrivateState);
      window.removeEventListener("pageshow", clearRestoredPrivateState);
    };
  }, [reset]);

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

  function lookupCredential(scannedQrToken?: string) {
    markActivity();
    if (previewMode) {
      setStatus("Preview only — credential lookup is disabled.");
      return;
    }
    const normalizedQrToken = typeof scannedQrToken === "string" ? scannedQrToken.trim() : qrToken.trim();
    const credential: VerifiedCredential = credentialMode === "qr"
      ? { method: "qr", qrToken: normalizedQrToken }
      : { method: "pin", pin };
    if ((credential.method === "pin" && credential.pin.length !== 4) || (credential.method === "qr" && !credential.qrToken)) {
      setError("Enter a PIN or scan a QR code before finding a family.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      setPendingAction("family_lookup");
      try {
        const { response, json, networkError } = await postKioskJson<({ error?: string } & LookupResult)>(
          "/api/kiosk/lookup",
          {
          centerId: center.id,
          ...(credential.method === "qr" ? { qrToken: credential.qrToken } : { pin: credential.pin }),
          },
        );
        if (networkError || !response) {
          setError("School Check-In could not connect. Check the connection and try again.");
          return;
        }
        if (!response.ok || !json) {
          setError(json?.error || "The Family PIN or QR code could not be verified. Try again or ask the front desk for help.");
          return;
        }
        setLookup(json);
        setVerifiedCredential(credential);
        setSelectedIds(json.children.map((child) => child.id));
        setSignatureName("");
      } finally {
        setPendingAction(null);
      }
    });
  }

  useEffect(() => {
    if (previewMode || activeKioskMode !== "family" || credentialMode !== "qr" || lookup) return undefined;
    let active = true;
    qrScanHandledRef.current = false;

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia || !qrVideoRef.current) {
        if (!active) return;
        setCameraState("unavailable");
        setCameraMessage("No camera is available on this device. Use your 4-Digit Family PIN, or connect a camera and try again.");
        return;
      }

      setCameraState("starting");
      setCameraMessage("Allow camera access when prompted.");
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (!active || !qrVideoRef.current) return;
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          qrVideoRef.current,
          (result) => {
            if (!active || !result || qrScanHandledRef.current) return;
            const value = result.getText().trim();
            if (!value) return;
            qrScanHandledRef.current = true;
            controls.stop();
            qrControlsRef.current = null;
            setQrToken(value);
            setCameraMessage("QR code scanned. Checking your family…");
            lookupCredential(value);
          },
        );
        if (!active) {
          controls.stop();
          return;
        }
        qrControlsRef.current = controls;
        setCameraState("scanning");
        setCameraMessage("Camera ready. Hold your School Check-In QR code inside the frame.");
      } catch (cameraError) {
        if (!active) return;
        qrControlsRef.current?.stop();
        qrControlsRef.current = null;
        const name = cameraError instanceof DOMException ? cameraError.name : "";
        const denied = name === "NotAllowedError" || name === "SecurityError";
        setCameraState("unavailable");
        setCameraMessage(denied
          ? "Camera access is blocked. Allow camera access in this browser, then try again—or use your 4-Digit Family PIN."
          : "The camera could not start. Try again, or use your 4-Digit Family PIN.");
      }
    }

    void startScanner();
    return () => {
      active = false;
      qrControlsRef.current?.stop();
      qrControlsRef.current = null;
    };
  // The lookup function intentionally uses the current kiosk state when a scan completes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKioskMode, cameraAttempt, credentialMode, lookup, previewMode]);

  function retryCamera() {
    markActivity();
    qrControlsRef.current?.stop();
    qrControlsRef.current = null;
    qrScanHandledRef.current = false;
    setQrToken("");
    setCameraState("idle");
    setCameraMessage("");
    setError("");
    setStatus("");
    setCameraAttempt((current) => current + 1);
  }

  function submit(type: "check_in" | "check_out") {
    markActivity();
    if (previewMode) {
      setStatus("Preview only — check-in and check-out are disabled.");
      return;
    }
    if (!verifiedCredential) {
      setError("Find the family before completing check-in or check-out.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      setPendingAction(type === "check_in" ? "family_check_in" : "family_check_out");
      try {
        const { response, json, networkError } = await postKioskJson<{
          error?: string;
          latePickup?: boolean;
          pickupAuthorizationWarning?: boolean;
          children?: Array<{ fullName: string }>;
        }>("/api/kiosk/check", {
          centerId: center.id,
          ...(verifiedCredential.method === "qr" ? { qrToken: verifiedCredential.qrToken } : { pin: verifiedCredential.pin }),
          childIds: selectedIds,
          type,
          signatureAccepted: Boolean(signatureName.trim()),
          signatureName,
        });
        if (networkError || !response) {
          setError("School Check-In lost its connection and could not confirm the result. Ask the front desk to verify before trying again.");
          return;
        }
        if (!response.ok || !json) {
          setError(json?.error || "Check-in or check-out could not be completed. Review the selected children and try again.");
          return;
        }
        reset(`${json.children?.map((child) => child.fullName).join(", ") || "Children"} ${type === "check_in" ? "checked in" : "checked out"}.${json.latePickup ? " Late pickup flagged for director review." : ""}${json.pickupAuthorizationWarning ? " Protected pickup note logged for director review." : ""}`);
      } finally {
        setPendingAction(null);
      }
    });
  }

  function lookupStaffCredential() {
    if (familyOnly) return;
    markActivity();
    if (previewMode) {
      setStatus("Preview only — staff lookup is disabled.");
      return;
    }
    if (!staffCredentialReady) {
      setError("Enter your 4 digit staff code.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      setPendingAction("staff_lookup");
      try {
        const { response, json, networkError } = await postKioskJson<({ error?: string } & StaffLookupResult)>(
          "/api/kiosk/staff",
          {
          centerId: center.id,
          email: staffEmail,
          pin: staffPin,
          action: "lookup",
          },
        );
        if (networkError || !response) {
          setError("The staff clock could not connect. Check the connection and try again.");
          return;
        }
        if (!response.ok || !json) {
          setError(json?.error || "The staff code could not be verified. Check the code and try again.");
          return;
        }
        setStaffLookup(json);
      } finally {
        setPendingAction(null);
      }
    });
  }

  function submitStaff(action: "clock_in" | "clock_out") {
    if (familyOnly) return;
    markActivity();
    if (previewMode) {
      setStatus("Preview only — staff clock actions are disabled.");
      return;
    }
    if (!staffCredentialReady) {
      setError("Enter your 4 digit staff code.");
      return;
    }

    startTransition(async () => {
      setError("");
      setStatus("");
      setPendingAction(action === "clock_in" ? "staff_clock_in" : "staff_clock_out");
      try {
        const { response, json, networkError } = await postKioskJson<({ error?: string } & StaffLookupResult)>(
          "/api/kiosk/staff",
          {
          centerId: center.id,
          email: staffEmail,
          pin: staffPin,
          action,
          notes: staffNotes,
          },
        );
        if (networkError || !response) {
          setError("The staff clock lost its connection and could not confirm the result. Ask a director to verify before trying again.");
          return;
        }
        if (!response.ok || !json) {
          setError(json?.error || "The staff clock action could not be completed. Review the current clock status and try again.");
          if (json?.staff) setStaffLookup(json);
          return;
        }
        reset(`${json.staff.name} ${action === "clock_in" ? "clocked in" : "clocked out"}.`);
        if (!familyOnly) setKioskMode("staff");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <main className="kiosk-halo-shell min-h-dvh select-none bg-background p-2 text-foreground sm:p-3 2xl:p-4">
      <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-6xl flex-col gap-3 sm:min-h-[calc(100dvh-1.5rem)] lg:gap-2 2xl:min-h-[calc(100dvh-2rem)] 2xl:gap-3">
        <section className="kiosk-halo-header rounded-2xl border bg-card/90 p-3 shadow-2xl shadow-black/20 sm:p-4 lg:p-3 2xl:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Badge className="mb-2">
                <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                {familyOnly ? "School Check-In" : "School Lobby"}
              </Badge>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl 2xl:text-4xl">{center.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {center.place || (familyOnly ? "Family check-in and check-out" : "Family check-in/out and staff clock-in/out")}
              </p>
            </div>
            <div className={`${hasPrivateState ? "flex" : "hidden xl:flex"} flex-wrap items-center gap-2 rounded-2xl border bg-background/60 p-2.5 sm:min-w-48 sm:justify-end`}>
              <div className="mr-auto hidden text-left xl:block sm:mr-0 sm:text-right">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
                  <Clock className="size-3.5" aria-hidden="true" />
                  Today
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {formatZonedDateTime(new Date(), center.timeZone, { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </div>
              {hasPrivateState ? (
                <>
                  <Badge variant="outline" className="min-h-9 justify-center px-3">
                    Clears in {idleSecondsRemaining}s
                  </Badge>
                  <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => reset()}>
                    Start Over
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </section>

        {status ? (
          <Alert>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <AlertTitle>Complete</AlertTitle>
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

        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-2 2xl:grid-cols-[24rem_minmax(0,1fr)] 2xl:gap-3">
          <Card className="kiosk-halo-panel glass-panel min-w-0 overflow-hidden">
            <CardHeader className="p-4 pb-2 lg:p-3 lg:pb-1 2xl:p-4 2xl:pb-2">
              <CardTitle>
                {activeKioskMode === "family"
                  ? credentialMode === "pin"
                    ? familyOnly ? "Enter Your 4-Digit Family PIN" : "Enter a 4-Digit Family PIN"
                    : familyOnly ? "Scan Your QR Code" : "Scan a Family QR Code"
                  : "Staff Clock-In & Clock-Out"}
              </CardTitle>
              <CardDescription>
                {activeKioskMode === "family"
                  ? credentialMode === "pin"
                    ? familyOnly ? "Enter the Family PIN from your parent portal." : "Use the PIN provided by your school director."
                    : familyOnly ? "Hold the QR code from your parent portal inside the frame." : "Use the guardian QR card issued by your school director."
                  : "Use your staff kiosk code to clock in or clock out. Add work email only if the kiosk asks for it."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2 lg:space-y-2 lg:p-3 lg:pt-1 2xl:space-y-3 2xl:p-4 2xl:pt-2">
              {!familyOnly ? (
                <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-background/60 p-1">
                  <Button type="button" variant={activeKioskMode === "family" ? "default" : "ghost"} onClick={() => selectKioskMode("family")}>
                    <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                    Family
                  </Button>
                  <Button type="button" variant={activeKioskMode === "staff" ? "default" : "ghost"} onClick={() => selectKioskMode("staff")}>
                    <UserRound data-icon="inline-start" aria-hidden="true" />
                    Staff
                  </Button>
                </div>
              ) : null}

              {activeKioskMode === "family" ? (
                <>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-background/60 p-1">
                    <Button type="button" variant={credentialMode === "pin" ? "default" : "ghost"} onClick={() => selectCredentialMode("pin")}>
                      <KeyRound data-icon="inline-start" aria-hidden="true" />
                      PIN
                    </Button>
                    <Button type="button" variant={credentialMode === "qr" ? "default" : "ghost"} onClick={() => selectCredentialMode("qr")}>
                      <QrCode data-icon="inline-start" aria-hidden="true" />
                      QR
                    </Button>
                  </div>

                  {cameraState === "unavailable" && cameraMessage ? (
                    <Alert>
                      <KeyRound className="size-4" aria-hidden="true" />
                      <AlertTitle>Camera needs attention</AlertTitle>
                      <AlertDescription>{cameraMessage}</AlertDescription>
                    </Alert>
                  ) : null}

                  {credentialMode === "pin" ? (
                    <>
                      <div
                        className="grid grid-cols-4 gap-3"
                        role="status"
                        aria-live="polite"
                        aria-label={`${pin.length} of 4 Family PIN digits entered`}
                      >
                        {[0, 1, 2, 3].map((index) => (
                          <div key={index} aria-hidden="true" className="grid aspect-square min-h-14 place-items-center rounded-2xl border bg-background/60 text-3xl font-semibold sm:min-h-16 lg:min-h-12 2xl:min-h-16">
                            {pin[index] ? "•" : ""}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                          <Button key={digit} type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 2xl:h-16" onClick={() => appendDigit(digit)}>
                            {digit}
                          </Button>
                        ))}
                        <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={!pin.length} onClick={() => {
                          markActivity();
                          setPin("");
                        }}>Clear</Button>
                        <Button type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 2xl:h-16" onClick={() => appendDigit("0")}>0</Button>
                        <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={!pin.length} onClick={() => {
                          markActivity();
                          setPin((current) => current.slice(0, -1));
                        }}>Delete</Button>
                      </div>
                      <Button className="h-14 w-full text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={isPending || pin.length !== 4} onClick={() => lookupCredential()}>
                        {pendingAction === "family_lookup" ? "Checking…" : "Continue"}
                      </Button>
                    </>
                  ) : (
                    <div className="grid gap-3">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-black">
                        <video ref={qrVideoRef} className="size-full object-cover" muted playsInline aria-label="QR code camera preview" />
                        <div className="pointer-events-none absolute inset-[12%] rounded-3xl border-4 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
                        {cameraState === "starting" ? (
                          <div className="absolute inset-0 grid place-items-center bg-black/50 px-6 text-center font-semibold text-white">Starting camera…</div>
                        ) : null}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground" aria-live="polite">
                        {previewMode ? "Camera scanning is disabled in this preview." : cameraMessage || "Starting the camera…"}
                      </p>
                      <div className={`grid gap-2 ${cameraState === "unavailable" ? "grid-cols-2" : "grid-cols-1"}`}>
                        <Button type="button" variant="outline" onClick={() => selectCredentialMode("pin")}>
                          <KeyRound data-icon="inline-start" aria-hidden="true" />
                          Use PIN Instead
                        </Button>
                        {cameraState === "unavailable" ? (
                          <Button type="button" variant="outline" onClick={retryCamera}>
                            <RefreshCw data-icon="inline-start" aria-hidden="true" />
                            Try Camera Again
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="staff-email" className="text-base">Work email (optional)</Label>
                    <Input
                      id="staff-email"
                      className="h-14 text-lg lg:h-12 2xl:h-14"
                      value={staffEmail}
                      onChange={(event) => {
                        markActivity();
                        setError("");
                        setStatus("");
                        setStaffLookup(null);
                        setStaffEmail(event.target.value);
                      }}
                      type="email"
                      name="staffEmail"
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="Only needed if the kiosk asks…"
                    />
                  </div>
                  <div
                    className="grid grid-cols-4 gap-3"
                    role="status"
                    aria-live="polite"
                    aria-label={`${staffPin.length} of 4 staff code digits entered`}
                  >
                    {[0, 1, 2, 3].map((index) => (
                      <div key={index} aria-hidden="true" className="grid aspect-square min-h-14 place-items-center rounded-2xl border bg-background/60 text-3xl font-semibold sm:min-h-16 lg:min-h-12 2xl:min-h-16">
                        {staffPin[index] ? "•" : ""}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Button key={digit} type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 2xl:h-16" onClick={() => appendStaffDigit(digit)}>
                        {digit}
                      </Button>
                    ))}
                    <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={!staffPin.length} onClick={() => {
                      markActivity();
                      setStaffLookup(null);
                      setStaffPin("");
                    }}>Clear</Button>
                    <Button type="button" variant="outline" className="h-14 text-2xl sm:h-16 lg:h-12 2xl:h-16" onClick={() => appendStaffDigit("0")}>0</Button>
                    <Button type="button" variant="outline" className="h-14 text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={!staffPin.length} onClick={() => {
                      markActivity();
                      setStaffLookup(null);
                      setStaffPin((current) => current.slice(0, -1));
                    }}>Delete</Button>
                  </div>
                  <Button className="h-14 w-full text-lg sm:h-16 lg:h-12 2xl:h-16" disabled={isPending || !staffCredentialReady} onClick={lookupStaffCredential}>
                    {pendingAction === "staff_lookup" ? "Checking…" : "Continue to Staff Clock"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="kiosk-halo-panel glass-panel min-w-0 overflow-hidden">
            <CardHeader className="p-4 pb-2 lg:p-3 lg:pb-1 2xl:p-4 2xl:pb-2">
              <CardTitle>
                {activeKioskMode === "staff"
                  ? staffLookup
                    ? staffLookup.staff.name
                    : "Staff Time Clock"
                  : lookup
                    ? lookup.family.name
                    : "Your Children"}
              </CardTitle>
              <CardDescription>
                {activeKioskMode === "staff"
                  ? staffLookup
                    ? `${staffLookup.staff.title} verified for ${center.name}.`
                    : "Staff can clock in or clock out after code verification."
                  : lookup
                    ? `${lookup.guardian.fullName} verified by ${verificationLabel}. Choose who is arriving or leaving.`
                    : "Enter your Family PIN or scan your QR code to see your children."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-72 min-w-0 flex-col gap-4 p-4 pt-2 md:min-h-0 lg:gap-3 lg:p-3 lg:pt-1 2xl:gap-4 2xl:p-4 2xl:pt-2">
              {activeKioskMode === "staff" ? (
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
                          Last event: {clockLabel(staffLookup.staff.clock.lastActionAt, center.timeZone)}
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
                          name="staffNotes"
                          autoComplete="off"
                          placeholder="Optional shift note…"
                        />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          className="h-20 text-xl"
                          variant={staffIsClockedIn ? "outline" : "default"}
                          disabled={isPending || staffLookup.staff.clock.status === "clocked_in"}
                          onClick={() => submitStaff("clock_in")}
                        >
                          <LogIn data-icon="inline-start" aria-hidden="true" />
                          {pendingAction === "staff_clock_in" ? "Saving…" : "Clock In"}
                        </Button>
                        <Button
                          className="h-20 text-xl"
                          variant={staffIsClockedIn ? "default" : "outline"}
                          disabled={isPending || staffLookup.staff.clock.status !== "clocked_in"}
                          onClick={() => submitStaff("clock_out")}
                        >
                          <LogOut data-icon="inline-start" aria-hidden="true" />
                          {pendingAction === "staff_clock_out" ? "Saving…" : "Clock Out"}
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
                      <h2 className="text-lg font-medium">Start Here</h2>
                      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Enter the 4-Digit staff code to view the current clock status, then clock in or clock out.
                      </p>
                    </div>
                  </div>
                )
              ) : lookup ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {lookup.billing ? (
                      <div className="md:col-span-2 rounded-2xl border border-primary/30 bg-primary/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <CreditCard className="size-4 text-primary" aria-hidden="true" />
                              Family Balance
                            </div>
                            <div className="mt-2 text-2xl font-semibold">{money(lookup.billing.amountDueCents)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {lookup.billing.nextInvoiceNumber
                                ? `${lookup.billing.nextInvoiceNumber} · due ${shortDate(lookup.billing.nextInvoiceDueDate)}`
                                : "Current family balance"}
                            </div>
                          </div>
                          <Button
                            className="h-12 w-full text-base sm:w-auto"
                            nativeButton={false}
                            render={(
                              <a
                                href={lookup.billing.paymentUrl || "/parent-portal#billing"}
                                target="_blank"
                                rel="noopener noreferrer"
                              />
                            )}
                          >
                            <CreditCard data-icon="inline-start" aria-hidden="true" />
                            {lookup.billing.paymentLabel}
                          </Button>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Open the Parent Portal to review details or pay securely on your own device.
                        </p>
                      </div>
                    ) : null}
                    {lookup.warnings?.map((warning) => {
                      const protectedPickup = warning.type === "protected_pickup_note";
                      return (
                        <Alert key={warning.type} variant={protectedPickup ? "destructive" : undefined} className="md:col-span-2">
                          <AlertCircle className="size-4" aria-hidden="true" />
                          <AlertTitle>{protectedPickup ? "Front desk verification" : "Tuition reminder"}</AlertTitle>
                          <AlertDescription>{warning.message}</AlertDescription>
                        </Alert>
                      );
                    })}
                    {lookup.children.length ? (
                      <>
                        <div className="rounded-xl border bg-background/50 p-3 text-sm text-muted-foreground md:col-span-2">
                          All children are selected. Uncheck anyone who is not arriving or leaving now.
                        </div>
                        {lookup.children.map((child) => {
                          const checked = selectedIds.includes(child.id);
                          const childDetails = [child.classroom?.name, child.ageGroup].filter(Boolean).join(" · ") || "School roster";
                          return (
                            <label key={child.id} className={`rounded-2xl border p-5 transition ${checked ? "border-primary bg-primary/10" : "bg-background/40"}`}>
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  name="selectedChildren"
                                  value={child.id}
                                  className="mt-1 size-7 accent-primary"
                                  checked={checked}
                                  onChange={(event) => {
                                    const selected = event.currentTarget.checked;
                                    markActivity();
                                    setSelectedIds((current) => updateKioskChildSelection(current, child.id, selected));
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="break-words text-lg font-semibold">{child.preferredName || child.fullName}</div>
                                  <div className="break-words text-sm text-muted-foreground">{childDetails}</div>
                                  <div className="mt-2 text-xs text-muted-foreground">{actionLabel(child.lastAction?.type)}</div>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </>
                    ) : (
                      <Alert variant="destructive" className="md:col-span-2">
                        <AlertCircle className="size-4" aria-hidden="true" />
                        <AlertTitle>No children available</AlertTitle>
                        <AlertDescription>
                          No children are available for this family at {center.name}. Ask the front desk to review the family record.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  {lookup.children.length ? (
                    <>
                      <div className="mt-auto grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2 sm:col-span-2">
                          <Label htmlFor="signature-name" className="text-base">Type Your Full Name</Label>
                          <Input
                            id="signature-name"
                            name="guardianSignature"
                            className="h-14 text-lg"
                            value={signatureName}
                            onChange={(event) => {
                              markActivity();
                              setSignatureName(event.target.value);
                            }}
                            placeholder="Type your full name…"
                            autoComplete="off"
                            spellCheck={false}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Your name confirms the selected children and the action you choose below.
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground sm:col-span-2" aria-live="polite">
                          {selectedActionMessage}
                        </p>
                        <Button className="h-20 text-xl" disabled={isPending || !canCheckInSelected || !signatureName.trim()} onClick={() => submit("check_in")}>
                          <LogIn data-icon="inline-start" aria-hidden="true" />
                          {pendingAction === "family_check_in" ? "Saving…" : "Check In"}
                        </Button>
                        <Button className="h-20 text-xl" variant="secondary" disabled={isPending || !canCheckOutSelected || !signatureName.trim()} onClick={() => submit("check_out")}>
                          <LogOut data-icon="inline-start" aria-hidden="true" />
                          {pendingAction === "family_check_out" ? "Saving…" : "Check Out"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        By tapping Check In or Check Out, you confirm the selected children are arriving or leaving with the verified adult.
                      </p>
                    </>
                  ) : null}
                </>
              ) : (
                <div className="grid flex-1 place-items-center rounded-2xl border bg-background/40 p-8 text-center">
                  <div>
                      <h2 className="text-lg font-medium">Start Here</h2>
                      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        Enter your 4-Digit Family PIN or scan your School Check-In QR code. Your children will appear here next.
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
