"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CreditCard } from "lucide-react";
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
  status: "would_charge" | "paid" | "processing" | "failed" | "skipped";
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
  if (method.autopayStatus !== "enabled") return "The parent has not enabled autopay.";
  if (!method.hasStripeCustomer || !method.hasSavedPaymentMethod) return "No saved payment method.";
  return null;
}

export function InvoiceStoredPaymentButton({ invoice }: { invoice: InvoiceStoredPaymentActionData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const method = invoice.billingAccount.paymentMethodManagement;
  const reason = disabledReason(invoice);

  function processAuthorizedAutopay() {
    const confirmed = window.confirm(
      `Process parent-authorized autopay for ${invoice.number} and ${invoice.billingAccount.family.name}? Account credit is applied first; any remaining balance, up to ${money(invoice.totalCents)}, is charged to the saved autopay method.`,
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
          retryFailed: true,
          limit: 1,
        }),
      });
      const json = await response.json().catch(() => null) as AutopaySummary | null;
      const result = json?.results?.find((item) => item.invoiceId === invoice.id);
      if (!response.ok || !json?.ok || !result) {
        setError(json?.error || "The invoice could not be processed with parent-authorized autopay. Review the family payment settings and try again.");
        return;
      }
      if (result.status !== "processing" && result.status !== "paid") {
        setError(result.reason || "This invoice cannot be processed with parent-authorized autopay.");
        return;
      }
      setMessage(
        result.status === "paid"
          ? result.stripePaymentIntentId
            ? "Payment recorded"
            : "Invoice paid with account credit"
          : result.stripePaymentIntentId
            ? "Payment submitted"
            : "Payment processing",
      );
      router.refresh();
    });
  }

  function openInstantBankCheckout() {
    if (invoice.status !== "OPEN") return setError("Invoice is not open.");
    if (invoice.totalCents <= 0) return setError("Invoice total must be greater than zero.");
    const confirmed = window.confirm(
      `Open a secure Link payment form for ${invoice.billingAccount.family.name} to pay ${money(invoice.totalCents)} for invoice ${invoice.number}?`,
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
        setError(json?.error || "The secure Link payment form could not be opened.");
        return;
      }
      window.location.href = json.url;
    });
  }

  function openCardCheckout() {
    if (invoice.status !== "OPEN") return setError("Invoice is not open.");
    if (invoice.totalCents <= 0) return setError("Invoice total must be greater than zero.");
    const confirmed = window.confirm(
      `Open a secure card payment form for ${invoice.billingAccount.family.name} to pay ${money(invoice.totalCents)} for invoice ${invoice.number}?`,
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
        setError(json?.error || "The secure card payment form could not be opened.");
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
          onClick={processAuthorizedAutopay}
          variant={reason ? "outline" : "default"}
        >
          <CreditCard data-icon="inline-start" />
          {isPending ? "Submitting…" : "Process authorized autopay"}
        </Button>
        <Button
          size="sm"
          disabled={isPending || invoice.status !== "OPEN" || invoice.totalCents <= 0}
          onClick={openInstantBankCheckout}
          variant="outline"
        >
          <CreditCard data-icon="inline-start" />
          Pay with Link
        </Button>
        <Button
          size="sm"
          disabled={isPending || invoice.status !== "OPEN" || invoice.totalCents <= 0}
          onClick={openCardCheckout}
          variant="outline"
        >
          <CreditCard data-icon="inline-start" />
          Debit or credit card
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
