"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Building2, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  token: string;
  familyName: string;
  centerLabel: string;
  recipientEmail: string;
  savedPaymentMethodLabel?: string | null;
  autopayStatus: "enabled" | "disabled" | "pending";
  paymentMethodStatus?: string | null;
  paymentStatus?: string | null;
  focus?: "instant-bank" | null;
  openInvoices?: Array<{
    id: string;
    number: string;
    status: string;
    dueDate: Date | string;
    totalCents: number;
  }>;
};

export function PaymentMethodRequestForm({
  token,
  familyName,
  centerLabel,
  recipientEmail,
  savedPaymentMethodLabel,
  autopayStatus,
  paymentMethodStatus,
  paymentStatus,
  focus,
  openInvoices = [],
}: Props) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const nextOpenInvoice = openInvoices[0] ?? null;

  function money(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function formatDate(value: Date | string) {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  }

  function startSetup(paymentMethodCategory: "link_bank" | "card") {
    if (paymentMethodCategory === "card") {
      const accepted = window.confirm(
        "Debit/credit card autopay may include the approved card processing recovery when a payment is charged. Continue with card setup?",
      );
      if (!accepted) return;
    }

    startTransition(async () => {
      setErrorMessage("");
      const response = await fetch("/api/billing/payment-method-request/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          paymentMethodCategory,
          processingRecoveryAccepted: paymentMethodCategory === "card",
        }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment setup could not be opened.");
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setErrorMessage("Payment setup did not return a secure form link.");
    });
  }

  function startPayment(invoiceId: string, paymentMethodCategory: "link_bank" | "card") {
    startTransition(async () => {
      setErrorMessage("");
      const response = await fetch("/api/billing/payment-method-request/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, invoiceId, paymentMethodCategory }),
      });
      const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
      if (!response.ok) {
        setErrorMessage(json?.error || "Payment checkout could not be opened.");
        return;
      }
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      setErrorMessage("Payment checkout did not return a secure form link.");
    });
  }

  return (
    <Card className="border-white/12 bg-white/[0.05] text-white shadow-2xl shadow-black/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>The BEE Suite Tuition Payment Profile</CardTitle>
            <CardDescription className="text-zinc-300">
              {centerLabel} requested this branded secure payment setup for {familyName}.
            </CardDescription>
          </div>
          <Badge variant={autopayStatus === "enabled" ? "default" : "outline"} className="capitalize">
            {autopayStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentMethodStatus === "success" ? (
          <Alert className="border-emerald-400/40 bg-emerald-400/10 text-emerald-50">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Payment information submitted</AlertTitle>
            <AlertDescription className="text-emerald-100">
              The BEE Suite is saving the verified payment method to this family profile through the secure processor. The school will see the updated autopay status shortly.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "success" ? (
          <Alert className="border-emerald-400/40 bg-emerald-400/10 text-emerald-50">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Payment submitted</AlertTitle>
            <AlertDescription className="text-emerald-100">
              The BEE Suite received the secure payment confirmation. The school will see it on the family ledger after reconciliation.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "cancelled" ? (
          <Alert className="border-amber-300/40 bg-amber-300/10 text-amber-50">
            <AlertCircle className="size-4" />
            <AlertTitle>Payment was cancelled</AlertTitle>
            <AlertDescription className="text-amber-100">
              No payment was submitted. You can reopen checkout whenever you are ready.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentMethodStatus === "cancelled" ? (
          <Alert className="border-amber-300/40 bg-amber-300/10 text-amber-50">
            <AlertCircle className="size-4" />
            <AlertTitle>Setup was cancelled</AlertTitle>
            <AlertDescription className="text-amber-100">
              No payment method was saved. You can reopen the secure form whenever you are ready.
            </AlertDescription>
          </Alert>
        ) : null}
        {autopayStatus === "pending" ? (
          <Alert className="border-amber-300/40 bg-amber-300/10 text-amber-50">
            <AlertCircle className="size-4" />
            <AlertTitle>Bank verification is pending</AlertTitle>
            <AlertDescription className="text-amber-100">
              To enable ACH autopay, use The BEE Suite Instant Bank Login to verify your account through your bank now. You can still use Debit/Credit Card to make today&apos;s payment.
            </AlertDescription>
          </Alert>
        ) : null}
        {focus === "instant-bank" ? (
          <Alert className="border-sky-300/40 bg-sky-300/10 text-sky-50">
            <Building2 className="size-4" />
            <AlertTitle>ACH autopay verification requested</AlertTitle>
            <AlertDescription className="text-sky-100">
              To complete ACH verification through The BEE Suite and enable autopay, select Verify Bank Instantly. You will log into your bank through the secure portal; The BEE Suite does not store your bank login.
            </AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive" className="bg-red-950/40">
            <AlertCircle className="size-4" />
            <AlertTitle>Needs attention</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-normal text-zinc-400">Family</div>
            <div className="mt-1 text-sm font-medium">{familyName}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-normal text-zinc-400">Recipient</div>
            <div className="mt-1 break-all text-sm font-medium">{recipientEmail}</div>
          </div>
        </div>

        {nextOpenInvoice ? (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Pay tuition today</div>
                <p className="mt-1 text-sm leading-6 text-zinc-200">
                  {nextOpenInvoice.number} is due {formatDate(nextOpenInvoice.dueDate)} for {money(nextOpenInvoice.totalCents)}.
                </p>
              </div>
              <Badge className="border-amber-300/30 bg-black/20 text-amber-100" variant="outline">
                {money(nextOpenInvoice.totalCents)}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="h-11" disabled={isPending} onClick={() => startPayment(nextOpenInvoice.id, "link_bank")}>
                <Building2 data-icon="inline-start" />
                <span className="sm:hidden">Bank Login</span>
                <span className="hidden sm:inline">Pay With Instant Bank Login</span>
              </Button>
              <Button className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={isPending} variant="outline" onClick={() => startPayment(nextOpenInvoice.id, "card")}>
                <CreditCard data-icon="inline-start" />
                <span className="sm:hidden">Debit/Credit</span>
                <span className="hidden sm:inline">Pay With Debit/Credit Card</span>
              </Button>
            </div>
            {openInvoices.length > 1 ? (
              <p className="mt-2 text-xs text-zinc-400">
                Additional open invoices can be paid from the parent portal or from a new school payment link.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-amber-300" />
            <div>
              <div className="text-sm font-medium">The BEE Suite payment profile</div>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                The BEE Suite keeps the school-facing tuition profile branded to your family. Stripe may appear during the secure processor step, but The BEE Suite never stores bank login credentials, full card numbers, or full bank account numbers.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Current saved method: {savedPaymentMethodLabel || "No saved payment method on file"}.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className={focus === "instant-bank" ? "h-11 bg-sky-500 text-white hover:bg-sky-400" : "h-11"}
            disabled={isPending}
            onClick={() => startSetup("link_bank")}
          >
            <Building2 data-icon="inline-start" />
            Verify Bank Instantly
          </Button>
          <Button className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={isPending} variant="outline" onClick={() => startSetup("card")}>
            <CreditCard data-icon="inline-start" />
            Save Debit/Credit Card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
