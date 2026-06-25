"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, CheckCircle2, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type InvoiceStoredPaymentActionData = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  billingAccount: {
    family: { name: string };
    paymentMethodManagement: {
      autopayStatus: "enabled" | "disabled" | "pending";
      hasStripeCustomer: boolean;
      hasSavedPaymentMethod: boolean;
      paymentMethodLabel: string | null;
    };
  };
};

type AutopayResult = {
  invoiceId: string;
  status: "would_charge" | "processing" | "failed" | "skipped";
  reason: string | null;
  stripePaymentIntentId: string | null;
};

type AutopaySummary = {
  ok?: boolean;
  error?: string;
  results?: AutopayResult[];
};

type CheckoutSummary = {
  ok?: boolean;
  error?: string;
  url?: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function disabledReason(invoice: InvoiceStoredPaymentActionData) {
  const method = invoice.billingAccount.paymentMethodManagement;
  if (invoice.status !== "OPEN") return "Invoice is not open.";
  if (invoice.totalCents <= 0) return "Invoice total must be greater than zero.";
  if (!method.hasStripeCustomer || !method.hasSavedPaymentMethod) return "No selected method.";
  return null;
}

export function InvoiceStoredPaymentButton({ invoice }: { invoice: InvoiceStoredPaymentActionData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const method = invoice.billingAccount.paymentMethodManagement;
  const reason = disabledReason(invoice);

  function processStoredMethod() {
    const confirmed = window.confirm(
      `Charge ${invoice.billingAccount.family.name}'s selected payment method ${money(invoice.totalCents)} for invoice ${invoice.number}?`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/billing/autopay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          dryRun: false,
          mode: "charge",
          processStoredMethod: true,
          retryFailed: true,
          limit: 1,
        }),
      });
      const json = await response.json().catch(() => null) as AutopaySummary | null;
      const result = json?.results?.find((item) => item.invoiceId === invoice.id);
      if (!response.ok || !json?.ok || !result) {
        setError(json?.error || "Selected payment method could not be submitted.");
        return;
      }
      if (result.status !== "processing") {
        setError(result.reason || "Selected payment method was not eligible.");
        return;
      }
      setMessage(result.stripePaymentIntentId ? "Payment submitted" : "Processing started");
      router.refresh();
    });
  }

  function openInstantBankCheckout() {
    if (invoice.status !== "OPEN") return setError("Invoice is not open.");
    if (invoice.totalCents <= 0) return setError("Invoice total must be greater than zero.");
    const confirmed = window.confirm(
      `Open The BEE Suite instant bank checkout for ${invoice.billingAccount.family.name} to pay ${money(invoice.totalCents)} for invoice ${invoice.number}? The secure processor will collect and verify the bank information.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          paymentMethodCategory: "link_bank",
          returnPath: "/billing-invoices",
        }),
      });
      const json = await response.json().catch(() => null) as CheckoutSummary | null;
      if (!response.ok || !json?.url) {
        setError(json?.error || "Instant bank checkout could not be opened.");
        return;
      }
      window.location.href = json.url;
    });
  }

  function openCardCheckout() {
    if (invoice.status !== "OPEN") return setError("Invoice is not open.");
    if (invoice.totalCents <= 0) return setError("Invoice total must be greater than zero.");
    const confirmed = window.confirm(
      `Open The BEE Suite debit/credit card checkout for ${invoice.billingAccount.family.name} to pay ${money(invoice.totalCents)} for invoice ${invoice.number}? The secure processor will collect the card information.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          paymentMethodCategory: "card",
          returnPath: "/billing-invoices",
        }),
      });
      const json = await response.json().catch(() => null) as CheckoutSummary | null;
      if (!response.ok || !json?.url) {
        setError(json?.error || "Debit/credit card checkout could not be opened.");
        return;
      }
      window.location.href = json.url;
    });
  }

  return (
    <div className="flex min-w-40 flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={isPending || Boolean(reason)}
          onClick={processStoredMethod}
          variant={reason ? "outline" : "default"}
        >
          <CreditCard data-icon="inline-start" />
          {isPending ? "Submitting" : "Charge Selected"}
        </Button>
        <Button
          size="sm"
          disabled={isPending || invoice.status !== "OPEN" || invoice.totalCents <= 0}
          onClick={openInstantBankCheckout}
          variant="outline"
        >
          <Building2 data-icon="inline-start" />
          Instant Bank
        </Button>
        <Button
          size="sm"
          disabled={isPending || invoice.status !== "OPEN" || invoice.totalCents <= 0}
          onClick={openCardCheckout}
          variant="outline"
        >
          <CreditCard data-icon="inline-start" />
          Debit/Credit
        </Button>
      </div>
      <div className="max-w-48 text-xs text-muted-foreground">
        {method.paymentMethodLabel ?? reason ?? ""}
      </div>
      {message ? (
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="size-3" />
          {message}
        </Badge>
      ) : null}
      {error ? (
        <Badge variant="destructive" className="gap-1 whitespace-normal text-left">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </Badge>
      ) : null}
    </div>
  );
}
