"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertCircle, Building2, CheckCircle2, CreditCard, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";

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
  reauthorization?: boolean;
  reauthorizationPreservesAutopay?: boolean;
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
  reauthorization = false,
  reauthorizationPreservesAutopay = false,
  openInvoices = [],
}: Props) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const nextOpenInvoice = openInvoices[0] ?? null;
  const showPendingBankVerification = autopayStatus === "pending" && paymentMethodStatus !== "success";
  const autopayLabel = reauthorization && reauthorizationPreservesAutopay
    ? "Autopay consent preserved"
    : autopayStatus === "enabled"
    ? "Autopay enabled"
    : autopayStatus === "pending"
      ? "Autopay setup pending"
      : "Autopay off";

  function money(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  function formatDate(value: Date | string) {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
  }

  function startSetup(paymentMethodCategory: "link_bank" | "card") {
    startTransition(async () => {
      setErrorMessage("");
      try {
        const response = await fetch("/api/billing/payment-method-request/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            paymentMethodCategory,
          }),
        });
        const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
        if (!response.ok) {
          setErrorMessage(json?.error || "The secure payment form could not be opened.");
          return;
        }
        if (json?.url) {
          window.location.href = json.url;
          return;
        }
        setErrorMessage("The secure payment form could not be opened. Try again or contact your school.");
      } catch {
        setErrorMessage("We could not reach the secure payment service. Check your connection and try again. No payment was started.");
      }
    });
  }

  function startPayment(invoiceId: string, paymentMethodCategory: "link_bank" | "card") {
    startTransition(async () => {
      setErrorMessage("");
      try {
        const response = await fetch("/api/billing/payment-method-request/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, invoiceId, paymentMethodCategory }),
        });
        const json = await response.json().catch(() => null) as { error?: string; url?: string } | null;
        if (!response.ok) {
          setErrorMessage(json?.error || "The secure payment form could not be opened.");
          return;
        }
        if (json?.url) {
          window.location.href = json.url;
          return;
        }
        setErrorMessage("The secure payment form could not be opened. Try again or contact your school.");
      } catch {
        setErrorMessage("We could not reach the secure payment service. Check your connection and try again. No payment was started.");
      }
    });
  }

  return (
    <Card className="border-white/12 bg-white/[0.05] text-white shadow-2xl shadow-black/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2">{reauthorization ? "Update tuition payment method" : "Tuition payment options"}</CardTitle>
            <CardDescription className="text-zinc-300">
              {centerLabel} sent this secure payment link for {familyName}.
            </CardDescription>
          </div>
          <Badge variant={autopayStatus === "enabled" || (reauthorization && reauthorizationPreservesAutopay) ? "default" : "outline"} className="capitalize">
            {autopayLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {reauthorization ? (
          <Alert className="border-sky-300/40 bg-sky-300/10 text-sky-50">
            <ShieldCheck className="size-4" />
            <AlertTitle>No payment will be charged</AlertTitle>
            <AlertDescription className="text-sky-100">
              Your school updated its secure Stripe account. Save a replacement method below. No payment is charged during setup. {reauthorizationPreservesAutopay
                ? "Your existing autopay consent will resume on the replacement method after Stripe confirms it. You do not need to turn autopay on again."
                : autopayStatus === "enabled"
                  ? "After the replacement is confirmed, sign in to review and re-enable autopay."
                  : "Autopay will remain off unless you enable it later in the Parent Portal."}
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentMethodStatus === "success" ? (
          <Alert className="border-emerald-400/40 bg-emerald-400/10 text-emerald-50">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Payment method submitted</AlertTitle>
            <AlertDescription className="text-emerald-100">
              We received confirmation that the payment method was submitted. If your bank requires another verification step, the status will update after the bank confirms it.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "success" ? (
          <Alert className="border-emerald-400/40 bg-emerald-400/10 text-emerald-50">
            <CheckCircle2 className="size-4" />
            <AlertTitle>Payment submitted</AlertTitle>
            <AlertDescription className="text-emerald-100">
              Confirmed card payments appear as paid. Bank payments may appear as processing until the bank confirms settlement. Sign in to the Parent Portal and choose Payments to review the current status and receipt.
              <Link href="/parents" className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                Open the Parent Portal
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "cancelled" ? (
          <Alert className="border-amber-300/40 bg-amber-300/10 text-amber-50">
            <AlertCircle className="size-4" />
            <AlertTitle>Payment was cancelled</AlertTitle>
            <AlertDescription className="text-amber-100">
              No payment was submitted. You can reopen the secure payment form whenever you are ready.
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === "failed" ? (
          <Alert variant="destructive" className="bg-red-950/40">
            <AlertCircle className="size-4" />
            <AlertTitle>Payment was not completed</AlertTitle>
            <AlertDescription>
              No completed payment was recorded. Review the invoice below and try again using a bank account or debit or credit card.
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
        {showPendingBankVerification ? (
          <Alert className="border-amber-300/40 bg-amber-300/10 text-amber-50">
            <AlertCircle className="size-4" />
            <AlertTitle>Bank verification is pending</AlertTitle>
            <AlertDescription className="text-amber-100">
              {reauthorization && reauthorizationPreservesAutopay
                ? "Stripe is still verifying the replacement bank account. Your existing autopay authorization remains in place and will resume automatically after verification. You do not need to turn autopay on again."
                : "Connect your bank account to complete verification. Saving a bank account does not turn on autopay; you can choose autopay separately in the Parent Portal or with your school. Open invoices do not block verification."}
            </AlertDescription>
          </Alert>
        ) : null}
        {focus === "instant-bank" ? (
          <Alert className="border-sky-300/40 bg-sky-300/10 text-sky-50">
            <Building2 className="size-4" />
            <AlertTitle>Bank verification requested</AlertTitle>
            <AlertDescription className="text-sky-100">
              Select Connect bank account to complete verification. Your bank may ask you to sign in through its secure form. The BEE Suite does not store your bank sign-in credentials, and any open invoices remain separate from this setup.
            </AlertDescription>
          </Alert>
        ) : null}
        {errorMessage ? (
          <Alert variant="destructive" className="bg-red-950/40">
            <AlertCircle className="size-4" />
            <AlertTitle>We couldn&apos;t continue</AlertTitle>
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

        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-amber-300" />
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                Payment method
                <InfoTip label="About secure payment setup" side="right" className="text-zinc-400 hover:text-white">
                  Connect a bank account or save a card for tuition payments. Stripe provides the secure form and may appear during setup, but The BEE Suite never stores bank sign-in credentials, full card numbers, or full bank account numbers.
                </InfoTip>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Current saved method: {savedPaymentMethodLabel || "No saved payment method on file"}. Saving or replacing a method does not change autopay.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            className={focus === "instant-bank" ? "order-1 h-11 bg-sky-500 text-white hover:bg-sky-400" : "order-2 h-11 border-white/15 bg-white/5 text-white hover:bg-white/10"}
            disabled={isPending || autopayStatus === "pending"}
            onClick={() => startSetup("link_bank")}
            variant={focus === "instant-bank" ? "default" : "outline"}
          >
            <Building2 data-icon="inline-start" />
            {reauthorization ? "Replace with bank account" : "Connect bank account"}
          </Button>
          <Button
            className={focus === "instant-bank" ? "order-2 h-11 border-white/15 bg-white/5 text-white hover:bg-white/10" : "order-1 h-11"}
            disabled={isPending || autopayStatus === "pending"}
            onClick={() => startSetup("card")}
            variant={focus === "instant-bank" ? "outline" : "default"}
          >
            <CreditCard data-icon="inline-start" />
            {reauthorization ? "Replace card" : "Save card"}
          </Button>
        </div>

        {nextOpenInvoice ? (
          <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Optional: pay tuition today</div>
                <p className="mt-1 text-sm leading-6 text-zinc-200">
                  {nextOpenInvoice.number} is due {formatDate(nextOpenInvoice.dueDate)} for {money(nextOpenInvoice.totalCents)}. Paying this invoice is separate from bank verification above.
                </p>
              </div>
              <Badge className="border-amber-300/30 bg-black/20 text-amber-100" variant="outline">
                {money(nextOpenInvoice.totalCents)}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button className="h-11" disabled={isPending} onClick={() => startPayment(nextOpenInvoice.id, "card")}>
                <CreditCard data-icon="inline-start" />
                <span className="sm:hidden">Card</span>
                <span className="hidden sm:inline">Debit or credit card</span>
              </Button>
              <Button className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={isPending} variant="outline" onClick={() => startPayment(nextOpenInvoice.id, "link_bank")}>
                <CreditCard data-icon="inline-start" />
                <span>Pay with Link</span>
              </Button>
            </div>
            {openInvoices.length > 1 ? (
              <p className="mt-2 text-xs text-zinc-400">
                Additional open invoices can be paid from the parent portal or from a new school payment link.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
