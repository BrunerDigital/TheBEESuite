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
};

export function PaymentMethodRequestForm({
  token,
  familyName,
  centerLabel,
  recipientEmail,
  savedPaymentMethodLabel,
  autopayStatus,
  paymentMethodStatus,
}: Props) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function startSetup(paymentMethodCategory: "ach" | "card") {
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

  return (
    <Card className="border-white/12 bg-white/[0.05] text-white shadow-2xl shadow-black/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Save Tuition Payment Information</CardTitle>
            <CardDescription className="text-zinc-300">
              {centerLabel} requested payment setup for {familyName}.
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
              Stripe is saving the payment method to this family profile. The school will see the updated autopay status shortly.
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

        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 text-amber-300" />
            <div>
              <div className="text-sm font-medium">Secure Stripe setup</div>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                The BEE Suite never stores full card or bank account numbers. Stripe securely saves the payment method and links it to this family for tuition payments and autopay.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                Current saved method: {savedPaymentMethodLabel || "No saved payment method on file"}.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-11" disabled={isPending} onClick={() => startSetup("ach")}>
            <Building2 data-icon="inline-start" />
            Use Bank Account
          </Button>
          <Button className="h-11 border-white/15 bg-white/5 text-white hover:bg-white/10" disabled={isPending} variant="outline" onClick={() => startSetup("card")}>
            <CreditCard data-icon="inline-start" />
            Use Debit/Credit Card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
