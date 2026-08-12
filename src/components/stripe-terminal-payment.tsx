"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { CreditCard, LoaderCircle, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TerminalReader = {
  id: string;
  label: string | null;
  deviceType: string | null;
  status: string | null;
  actionStatus: string | null;
};

type TerminalAmounts = {
  invoiceAmountCents: number;
  parentProcessingRecoveryAmountCents: number;
  checkoutTotalCents: number;
};

type Props = {
  centerId: string;
  billingAccountId: string;
  familyId: string;
  invoiceId?: string | null;
  amountCents: number;
  description: string;
  disabled?: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function StripeTerminalPayment({
  centerId,
  billingAccountId,
  familyId,
  invoiceId,
  amountCents,
  description,
  disabled,
}: Props) {
  const router = useRouter();
  const controlId = useId();
  const readerSelectId = `${controlId}-reader`;
  const registrationCodeId = `${controlId}-registration-code`;
  const readerLabelId = `${controlId}-reader-label`;
  const parentPresentId = `${controlId}-parent-present`;
  const [open, setOpen] = useState(false);
  const [readers, setReaders] = useState<TerminalReader[]>([]);
  const [readerId, setReaderId] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [readerLabel, setReaderLabel] = useState("");
  const [amounts, setAmounts] = useState<TerminalAmounts | null>(null);
  const [parentPresent, setParentPresent] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "processing" | "succeeded" | "failed">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadReaders = useCallback(async () => {
    if (!centerId || amountCents <= 0) return;
    setStatus("loading");
    setError("");
    const response = await fetch(
      `/api/billing/terminal-payment?centerId=${encodeURIComponent(centerId)}&amountCents=${amountCents}`,
      { cache: "no-store" },
    );
    const json = await response.json().catch(() => null) as {
      error?: string;
      readers?: TerminalReader[];
      amounts?: TerminalAmounts | null;
    } | null;
    if (!response.ok) {
      setStatus("failed");
      setError(json?.error || "Card readers could not be loaded.");
      return;
    }
    const nextReaders = json?.readers ?? [];
    setReaders(nextReaders);
    setAmounts(json?.amounts ?? null);
    setReaderId((current) => nextReaders.some((reader) => reader.id === current)
      ? current
      : nextReaders.find((reader) => reader.status === "online")?.id || nextReaders[0]?.id || "");
    setStatus("idle");
  }, [amountCents, centerId]);

  useEffect(() => {
    if (!open || !paymentId || status !== "processing") return;
    let stopped = false;
    const check = async () => {
      const response = await fetch("/api/billing/terminal-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "payment_status", paymentId }),
      });
      const json = await response.json().catch(() => null) as { status?: string; error?: string } | null;
      if (stopped) return;
      if (json?.status === "succeeded") {
        setStatus("succeeded");
        setMessage("The in-person card payment was approved and recorded.");
        router.refresh();
        return;
      }
      if (!response.ok || json?.status === "failed" || json?.status === "review") {
        setStatus("failed");
        setError(json?.error || "The in-person card payment did not complete.");
      }
    };
    const timer = window.setInterval(() => void check(), 2_000);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [open, paymentId, router, status]);

  async function registerReader() {
    if (!registrationCode.trim()) {
      setError("Enter the registration code shown on the reader.");
      return;
    }
    setStatus("loading");
    setError("");
    setMessage("");
    const response = await fetch("/api/billing/terminal-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register_reader",
        centerId,
        registrationCode: registrationCode.trim(),
        label: readerLabel.trim(),
      }),
    });
    const json = await response.json().catch(() => null) as { error?: string; reader?: TerminalReader } | null;
    if (!response.ok || !json?.reader) {
      setStatus("failed");
      setError(json?.error || "The card reader could not be registered.");
      return;
    }
    setRegistrationCode("");
    setReaderLabel("");
    setMessage("Reader registered to this school.");
    await loadReaders();
  }

  async function startPayment() {
    if (!readerId) {
      setError("Choose an online card reader.");
      return;
    }
    if (!parentPresent) {
      setError("Confirm that the parent is present to review the amount on the reader.");
      return;
    }
    setStatus("loading");
    setError("");
    setMessage("");
    const response = await fetch("/api/billing/terminal-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "process_payment",
        centerId,
        billingAccountId,
        familyId,
        invoiceId: invoiceId || null,
        readerId,
        amountCents,
        description,
        parentPresent: true,
      }),
    });
    const json = await response.json().catch(() => null) as { error?: string; paymentId?: string } | null;
    if (!response.ok || !json?.paymentId) {
      setStatus("failed");
      setError(json?.error || "The reader payment could not be started.");
      return;
    }
    setPaymentId(json.paymentId);
    setStatus("processing");
    setMessage("Reader ready. Ask the parent to tap, insert, or swipe their card.");
  }

  const selectedReader = readers.find((reader) => reader.id === readerId) ?? null;
  const readerBusy = selectedReader?.actionStatus === "in_progress";
  const canProcess = Boolean(
    readerId &&
    selectedReader?.status === "online" &&
    !readerBusy &&
    parentPresent &&
    amountCents > 0 &&
    status !== "loading" &&
    status !== "processing",
  );

  function openTerminal() {
    setPaymentId("");
    setParentPresent(false);
    setMessage("");
    setError("");
    setStatus("idle");
    setOpen(true);
    void loadReaders();
  }

  return (
    <>
      <Button type="button" disabled={disabled || !centerId || !billingAccountId || !familyId || amountCents <= 0} onClick={openTerminal}>
        <RadioTower data-icon="inline-start" />
        In-person card reader
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && status !== "processing" && setOpen(false)}>
        <DialogContent className="max-w-xl" aria-busy={status === "loading" || status === "processing"}>
          <DialogHeader>
            <DialogTitle>The BEE Suite in-person card payment</DialogTitle>
            <DialogDescription>
              The parent pays on a certified reader. Card details are encrypted by the payment hardware and never enter The BEE Suite.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2 rounded-lg border bg-muted/25 p-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Account payment</div>
                <div className="font-medium">{money(amountCents)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Card recovery</div>
                <div className="font-medium">{money(amounts?.parentProcessingRecoveryAmountCents ?? 0)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Shown on reader</div>
                <div className="font-medium">{money(amounts?.checkoutTotalCents ?? amountCents)}</div>
              </div>
            </div>

            {readers.length ? (
              <div className="space-y-2">
                <Label htmlFor={readerSelectId}>School card reader</Label>
                <Select value={readerId} onValueChange={(value) => value && setReaderId(value)}>
                  <SelectTrigger id={readerSelectId}><SelectValue placeholder="Choose a reader" /></SelectTrigger>
                  <SelectContent>
                    {readers.map((reader) => (
                      <SelectItem key={reader.id} value={reader.id}>
                        {reader.label || reader.id} · {reader.status || "unknown"}{reader.actionStatus === "in_progress" ? " · busy" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Badge variant={selectedReader?.status === "online" ? "default" : "outline"}>
                    {selectedReader?.status || "No reader"}
                  </Badge>
                  {selectedReader?.deviceType ? <Badge variant="outline">{selectedReader.deviceType}</Badge> : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2 rounded-lg border p-3">
              <div className="font-medium">{readers.length ? "Register another reader" : "Register this school's reader"}</div>
              <p className="text-xs text-muted-foreground">
                On a Stripe S700/S710 or WisePOS E, generate a pairing code in reader settings. The web app controls smart readers over the network. A direct USB data connection is available only through Stripe&apos;s Android mobile-reader SDK.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={registrationCodeId}>Registration code</Label>
                  <Input
                    id={registrationCodeId}
                    name="terminalRegistrationCode"
                    autoComplete="off"
                    value={registrationCode}
                    onChange={(event) => setRegistrationCode(event.target.value)}
                    placeholder="Pairing code"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={readerLabelId}>Reader label</Label>
                  <Input
                    id={readerLabelId}
                    name="terminalReaderLabel"
                    value={readerLabel}
                    onChange={(event) => setReaderLabel(event.target.value)}
                    placeholder="Front desk"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" disabled={status === "loading" || status === "processing"} onClick={registerReader}>
                {status === "loading" ? "Working…" : "Register reader"}
              </Button>
            </div>

            <label htmlFor={parentPresentId} className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                id={parentPresentId}
                name="terminalParentPresent"
                type="checkbox"
                className="mt-0.5 size-5 shrink-0"
                checked={parentPresent}
                disabled={status === "processing" || status === "succeeded"}
                onChange={(event) => setParentPresent(event.target.checked)}
              />
              <span>
                The parent is present and can review the total on the reader before tapping, inserting, or swiping. The parent can cancel from the reader.
              </span>
            </label>

            {message ? (
              <Alert>
                <CreditCard className="size-4" />
                <AlertTitle>{status === "succeeded" ? "Payment recorded" : "Reader status"}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Card reader needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={status === "processing"} onClick={() => setOpen(false)}>
              {status === "succeeded" ? "Done" : "Close"}
            </Button>
            <Button type="button" disabled={!canProcess} onClick={startPayment}>
              {status === "loading" || status === "processing" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <CreditCard data-icon="inline-start" />}
              {status === "processing" ? "Waiting for card" : status === "loading" ? "Starting…" : `Charge ${money(amounts?.checkoutTotalCents ?? amountCents)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
