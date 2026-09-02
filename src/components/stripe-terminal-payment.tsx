"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { CreditCard, LoaderCircle, RadioTower, Settings2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  accountCreditAppliedCents: number;
  parentProcessingRecoveryAmountCents: number;
  checkoutTotalCents: number;
  paymentRequired: boolean;
};

type Props = {
  centerId: string;
  billingAccountId: string;
  familyId: string;
  invoiceId?: string | null;
  amountCents: number;
  description: string;
  disabled?: boolean;
  presentation?: "dialog" | "embedded";
  contextLabel?: string;
  previewMode?: boolean;
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
  presentation = "dialog",
  contextLabel,
  previewMode = false,
}: Props) {
  const router = useRouter();
  const controlId = useId();
  const readerSelectId = `${controlId}-reader`;
  const registrationCodeId = `${controlId}-registration-code`;
  const readerLabelId = `${controlId}-reader-label`;
  const parentPresentId = `${controlId}-parent-present`;
  const [open, setOpen] = useState(false);
  const [readers, setReaders] = useState<TerminalReader[]>(previewMode ? [{ id: "preview-reader", label: "Front Desk Reader", deviceType: "Stripe S700", status: "online", actionStatus: null }] : []);
  const [readerId, setReaderId] = useState(previewMode ? "preview-reader" : "");
  const [registrationCode, setRegistrationCode] = useState("");
  const [readerLabel, setReaderLabel] = useState("");
  const [amounts, setAmounts] = useState<TerminalAmounts | null>(previewMode ? { invoiceAmountCents: amountCents, accountCreditAppliedCents: 0, parentProcessingRecoveryAmountCents: 0, checkoutTotalCents: amountCents, paymentRequired: true } : null);
  const [parentPresent, setParentPresent] = useState(false);
  const [paymentId, setPaymentId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "processing" | "succeeded" | "failed">("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const embedded = presentation === "embedded";
  const active = embedded || open;

  const loadReaders = useCallback(async () => {
    if (!centerId || amountCents <= 0) return;
    if (previewMode) return;
    setStatus("loading");
    setError("");
    const response = await fetch(
      `/api/billing/terminal-payment?centerId=${encodeURIComponent(centerId)}&billingAccountId=${encodeURIComponent(billingAccountId)}&familyId=${encodeURIComponent(familyId)}&invoiceId=${encodeURIComponent(invoiceId || "")}&amountCents=${amountCents}`,
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
  }, [amountCents, billingAccountId, centerId, familyId, invoiceId, previewMode]);

  useEffect(() => {
    if (!active || !paymentId || status !== "processing") return;
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
      if ((!response.ok && json?.status !== "processing") || json?.status === "failed" || json?.status === "review") {
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
  }, [active, paymentId, router, status]);

  useEffect(() => {
    if (!embedded) return;
    const timer = window.setTimeout(() => void loadReaders(), 0);
    return () => window.clearTimeout(timer);
  }, [embedded, loadReaders]);

  async function registerReader() {
    if (previewMode) {
      setMessage("Preview only. Reader settings are not saved.");
      return;
    }
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
    if (previewMode) {
      setStatus("succeeded");
      setMessage("Preview approved. No payment was submitted or recorded.");
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
    const json = await response.json().catch(() => null) as { error?: string; paymentId?: string; status?: string } | null;
    if (json?.paymentId && json.status === "processing") {
      setPaymentId(json.paymentId);
      setStatus("processing");
      setMessage(response.ok
        ? "Reader ready. Ask the parent to tap, insert, or swipe their card."
        : "The reader response was interrupted. The original payment attempt is being reconciled; do not start another payment.");
      return;
    }
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
    amounts?.paymentRequired === true &&
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

  const terminalBody = (
    <>
      <div className="space-y-4">
            <div className="grid gap-2 rounded-lg border bg-muted/25 p-3 sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Card payment</div>
                <div className="font-medium">{money(amounts?.invoiceAmountCents ?? amountCents)}</div>
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

            {(amounts?.accountCreditAppliedCents ?? 0) > 0 ? (
              <Alert>
                <AlertTitle>Account credit applied</AlertTitle>
                <AlertDescription>
                  {money(amounts!.accountCreditAppliedCents)} in existing account credit is applied before the card charge.
                </AlertDescription>
              </Alert>
            ) : null}

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

            <details className="group rounded-lg border p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-medium focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Settings2 className="size-4" aria-hidden="true" />
                {readers.length ? "Reader Settings" : "Register This School’s Reader"}
              </summary>
              <p className="text-xs text-muted-foreground">
                On a Stripe S700/S710 or WisePOS E, generate a pairing code in reader settings. The web app controls smart readers over the network. A direct USB data connection is available only through Stripe&apos;s Android mobile-reader SDK.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={registrationCodeId}>Registration code</Label>
                  <Input
                    id={registrationCodeId}
                    name="terminalRegistrationCode"
                    autoComplete="off"
                    spellCheck={false}
                    value={registrationCode}
                    onChange={(event) => setRegistrationCode(event.target.value)}
                    placeholder="Enter pairing code…"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={readerLabelId}>Reader label</Label>
                  <Input
                    id={readerLabelId}
                    name="terminalReaderLabel"
                    autoComplete="off"
                    value={readerLabel}
                    onChange={(event) => setReaderLabel(event.target.value)}
                    placeholder="Example: Front desk…"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" disabled={status === "loading" || status === "processing"} onClick={registerReader}>
                {status === "loading" ? "Working…" : "Register reader"}
              </Button>
            </details>

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
              <Alert aria-live="polite">
                <CreditCard className="size-4" />
                <AlertTitle>{status === "succeeded" ? "Payment recorded" : "Reader status"}</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive" aria-live="polite">
                <AlertTitle>Card reader needs attention</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!embedded ? (
              <Button type="button" variant="outline" disabled={status === "processing"} onClick={() => setOpen(false)}>
                {status === "succeeded" ? "Done" : "Close"}
              </Button>
            ) : null}
            <Button type="button" disabled={!canProcess} onClick={startPayment}>
              {status === "loading" || status === "processing" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <CreditCard data-icon="inline-start" />}
              {status === "processing"
                ? "Waiting for card"
                : status === "loading"
                  ? "Starting…"
                  : amounts?.paymentRequired === false
                    ? "Covered by account credit"
                    : `Charge ${money(amounts?.checkoutTotalCents ?? amountCents)}`}
            </Button>
          </div>
    </>
  );

  if (embedded) {
    return (
      <section className="glass-panel overflow-hidden rounded-2xl border border-primary/25 bg-card shadow-2xl shadow-primary/5" aria-labelledby="embedded-terminal-title">
        <div className="border-b bg-gradient-to-br from-primary/12 via-card to-amber-500/10 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg" aria-hidden="true"><RadioTower className="size-6" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="embedded-terminal-title" className="text-balance text-xl font-bold">2. Confirm Reader & Collect</h2>
                <Badge variant="outline"><ShieldCheck data-icon="inline-start" />Certified hardware</Badge>
              </div>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">{contextLabel || "Choose a family and amount to prepare the terminal."}</p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {disabled || !centerId || !billingAccountId || !familyId || amountCents <= 0 ? (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden="true"><CreditCard className="size-6" /></span>
                <h3 className="mt-4 font-semibold">Complete the Payment Context</h3>
                <p className="mt-1 text-sm text-muted-foreground">Choose a current family with a billing account and an exact invoice or account amount.</p>
              </div>
            </div>
          ) : terminalBody}
        </div>
      </section>
    );
  }

  return (
    <>
      <Button disabled={disabled || !centerId || !billingAccountId || !familyId || amountCents <= 0} onClick={openTerminal}>
        <RadioTower data-icon="inline-start" />
        In-Person Card Reader
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && status !== "processing" && setOpen(false)}>
        <DialogContent className="max-w-xl overscroll-contain">
          <DialogHeader>
            <DialogTitle>The BEE Suite In-Person Card Payment</DialogTitle>
            <DialogDescription>
              The parent pays on a certified reader. Card details are encrypted by the payment hardware and never enter The BEE Suite.
            </DialogDescription>
          </DialogHeader>
          {terminalBody}
        </DialogContent>
      </Dialog>
    </>
  );
}
