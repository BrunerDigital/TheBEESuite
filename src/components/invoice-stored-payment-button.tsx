"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  invoiceAutopayBlockReason,
  invoicePaymentActionBlockReason,
} from "@/lib/invoice-payment-actions";

export type InvoiceStoredPaymentActionData = {
  id: string;
  number: string;
  status: string;
  totalCents: number;
  responsibilityReviewRequired: boolean;
  responsibilitySeparation: {
    familyResponsibilityCents: number;
    agencyResponsibilityCents: number;
    agencyName: string;
  } | null;
  billingAccount: {
    balanceCents: number;
    family: { name: string; accountCategory: "current" | "past" };
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

type ResponsibilitySummary = {
  ok?: boolean;
  error?: string;
  familyResponsibilityCents?: number;
  agencyResponsibilityCents?: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function disabledReason(invoice: InvoiceStoredPaymentActionData) {
  const method = invoice.billingAccount.paymentMethodManagement;
  return invoiceAutopayBlockReason({
    accountCategory: invoice.billingAccount.family.accountCategory,
    invoiceStatus: invoice.status,
    invoiceTotalCents: invoice.totalCents,
    autopayStatus: method.autopayStatus,
    hasStripeCustomer: method.hasStripeCustomer,
    hasSavedPaymentMethod: method.hasSavedPaymentMethod,
  });
}

export function InvoiceStoredPaymentButton({ invoice }: { invoice: InvoiceStoredPaymentActionData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showResponsibilityForm, setShowResponsibilityForm] = useState(false);
  const [familyResponsibilityDollars, setFamilyResponsibilityDollars] = useState("");
  const [agencyResponsibilityDollars, setAgencyResponsibilityDollars] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [authorizationNumber, setAuthorizationNumber] = useState("");
  const method = invoice.billingAccount.paymentMethodManagement;
  const reason = disabledReason(invoice);
  const paymentActionReason = invoicePaymentActionBlockReason({
    invoiceStatus: invoice.status,
    invoiceTotalCents: invoice.totalCents,
  });

  function dollarsToCents(value: string) {
    const normalized = value.trim().replace(/[$,]/g, "");
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
  }

  function separateResponsibility() {
    if (paymentActionReason) return setError(paymentActionReason);
    const familyResponsibilityCents = dollarsToCents(familyResponsibilityDollars);
    const agencyResponsibilityCents = dollarsToCents(agencyResponsibilityDollars);
    if (familyResponsibilityCents === null || agencyResponsibilityCents === null || agencyResponsibilityCents <= 0) {
      return setError("Enter the family amount and an agency amount greater than zero.");
    }
    if (familyResponsibilityCents + agencyResponsibilityCents !== invoice.totalCents) {
      return setError(`Family and agency responsibility must total exactly ${money(invoice.totalCents)}.`);
    }
    if (!agencyName.trim()) return setError("Enter the agency payer.");
    const confirmed = window.confirm(
      `Separate ${invoice.number} into ${money(familyResponsibilityCents)} family responsibility and ${money(agencyResponsibilityCents)} ${agencyName.trim()} responsibility? This records an agency receivable; it does not record an agency payment.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      setMessage("");
      setError("");
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "separateResponsibility",
          invoiceId: invoice.id,
          expectedInvoiceTotalCents: invoice.totalCents,
          expectedAccountBalanceCents: invoice.billingAccount.balanceCents,
          familyResponsibilityCents,
          agencyResponsibilityCents,
          agencyName: agencyName.trim(),
          authorizationNumber: authorizationNumber.trim() || undefined,
        }),
      });
      const json = await response.json().catch(() => null) as ResponsibilitySummary | null;
      if (!response.ok || !json?.ok) {
        setError(json?.error || "Responsibility could not be separated. Refresh the invoice and try again.");
        return;
      }
      setMessage(`Separated: family ${money(familyResponsibilityCents)} · agency ${money(agencyResponsibilityCents)}`);
      setShowResponsibilityForm(false);
      router.refresh();
    });
  }

  function processAuthorizedAutopay() {
    if (reason) return setError(reason);
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
    if (paymentActionReason) return setError(paymentActionReason);
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
    if (paymentActionReason) return setError(paymentActionReason);
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
          disabled={isPending || Boolean(paymentActionReason)}
          onClick={openInstantBankCheckout}
          variant="outline"
        >
          <CreditCard data-icon="inline-start" />
          Pay with Link
        </Button>
        <Button
          size="sm"
          disabled={isPending || Boolean(paymentActionReason)}
          onClick={openCardCheckout}
          variant="outline"
        >
          <CreditCard data-icon="inline-start" />
          Debit or credit card
        </Button>
        {invoice.responsibilityReviewRequired ? (
          <Button
            size="sm"
            disabled={isPending || Boolean(paymentActionReason)}
            onClick={() => setShowResponsibilityForm((current) => !current)}
            variant="outline"
          >
            {showResponsibilityForm ? "Cancel separation" : "Separate responsibility"}
          </Button>
        ) : null}
      </div>
      <div className="max-w-48 text-xs text-muted-foreground">
        {method.paymentMethodLabel ?? ""}
        {reason ? <span className={method.paymentMethodLabel ? "mt-1 block" : ""}>{reason}</span> : null}
      </div>
      {invoice.responsibilitySeparation ? (
        <div className="max-w-72 text-xs text-muted-foreground">
          Family {money(invoice.responsibilitySeparation.familyResponsibilityCents)} · {invoice.responsibilitySeparation.agencyName} {money(invoice.responsibilitySeparation.agencyResponsibilityCents)}
        </div>
      ) : null}
      {showResponsibilityForm && invoice.responsibilityReviewRequired ? (
        <div className="mt-2 grid w-full min-w-72 gap-3 rounded-lg border bg-background/70 p-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-medium">Invoice total: {money(invoice.totalCents)}</p>
            <p className="text-xs text-muted-foreground">Enter the exact family copay and agency portion. This does not record money received.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`family-responsibility-${invoice.id}`}>Family responsibility</Label>
            <Input id={`family-responsibility-${invoice.id}`} inputMode="decimal" placeholder="20.00" value={familyResponsibilityDollars} onChange={(event) => setFamilyResponsibilityDollars(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`agency-responsibility-${invoice.id}`}>Agency responsibility</Label>
            <Input id={`agency-responsibility-${invoice.id}`} inputMode="decimal" placeholder="100.00" value={agencyResponsibilityDollars} onChange={(event) => setAgencyResponsibilityDollars(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`agency-name-${invoice.id}`}>Agency payer</Label>
            <Input id={`agency-name-${invoice.id}`} placeholder="CCDF, ELC, DHS" value={agencyName} onChange={(event) => setAgencyName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`agency-authorization-${invoice.id}`}>Authorization # (optional)</Label>
            <Input id={`agency-authorization-${invoice.id}`} value={authorizationNumber} onChange={(event) => setAuthorizationNumber(event.target.value)} />
          </div>
          <Button className="sm:col-span-2" disabled={isPending} onClick={separateResponsibility}>
            {isPending ? "Separating…" : "Confirm responsibility separation"}
          </Button>
        </div>
      ) : null}
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
