"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, BadgeDollarSign, CheckCircle2, CreditCard, Landmark, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE,
} from "@/lib/payment-disclosures";
import { stripeConnectReadinessFromFields } from "@/lib/stripe-connect-readiness";
import {
  normalizeStripeConnectSetupInput,
  type StripeConnectSetupDetails,
} from "@/lib/stripe-connect-setup";

export type StripeConnectCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  customFields: unknown;
};

type StripeConnectPanelProps = {
  centers: StripeConnectCenter[];
  stripeConfigured: boolean;
  webhookConfigured: boolean;
  parentProcessingRecoveryApproved: boolean;
  parentSurchargeBps: number;
  parentSurchargeFixedCents: number;
};

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function statusLabel(center: StripeConnectCenter) {
  return stripeConnectReadinessFromFields(center.customFields).label;
}

function statusVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "Ready") return "default";
  if (status === "Needs setup") return "outline";
  if (status === "Requirements due") return "destructive";
  return "secondary";
}

function maskedAccount(center: StripeConnectCenter) {
  const accountId = stripeConnectReadinessFromFields(center.customFields).accountId;
  if (!accountId) return "Not connected";
  return `${accountId.slice(0, 8)}...${accountId.slice(-4)}`;
}

function payoutBankLabel(center: StripeConnectCenter) {
  const centerFields = fields(center.customFields);
  const bankName = text(centerFields.stripePayoutBankName);
  const last4 = text(centerFields.stripePayoutBankLast4);
  if (last4) return `${bankName || "Bank account"} •••• ${last4}`;
  return maskedAccount(center) === "Not connected" ? "Not connected" : "Choose bank for this school";
}

function percentFromBps(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

function centsLabel(cents: number) {
  if (!cents) return "";
  return ` + ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)}`;
}

function setupErrorsFromResponse(value: unknown): Partial<Record<keyof StripeConnectSetupDetails, string>> {
  return Object.fromEntries(
    Object.entries(fields(value))
      .filter((entry): entry is [keyof StripeConnectSetupDetails, string] => typeof entry[1] === "string"),
  ) as Partial<Record<keyof StripeConnectSetupDetails, string>>;
}

export function StripeConnectPanel({
  centers,
  stripeConfigured,
  webhookConfigured,
  parentProcessingRecoveryApproved,
  parentSurchargeBps,
  parentSurchargeFixedCents,
}: StripeConnectPanelProps) {
  const searchParams = useSearchParams();
  const [busyCenterId, setBusyCenterId] = useState<string | null>(null);
  const payoutWindowRef = useRef<Window | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localCenters, setLocalCenters] = useState(centers);
  const [setupCenterId, setSetupCenterId] = useState<string | null>(null);
  const [setupForm, setSetupForm] = useState<StripeConnectSetupDetails | null>(null);
  const [setupErrors, setSetupErrors] = useState<Partial<Record<keyof StripeConnectSetupDetails, string>>>({});
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const setupCenter = useMemo(
    () => localCenters.find((center) => center.id === setupCenterId) ?? null,
    [localCenters, setupCenterId],
  );

  const stats = useMemo(() => {
    const ready = localCenters.filter((center) => statusLabel(center) === "Ready").length;
    const started = localCenters.filter((center) => maskedAccount(center) !== "Not connected").length;
    return {
      ready,
      started,
      needsSetup: Math.max(0, localCenters.length - started),
    };
  }, [localCenters]);

  function openSetupDialog(center: StripeConnectCenter) {
    const setup = normalizeStripeConnectSetupInput({}, center);
    setSetupCenterId(center.id);
    setSetupForm(setup.details);
    setSetupErrors({});
    setSetupMessage(null);
    setMessage(null);
  }

  function closeSetupDialog() {
    setSetupCenterId(null);
    setSetupForm(null);
    setSetupErrors({});
    setSetupMessage(null);
  }

  function updateSetupField(field: keyof StripeConnectSetupDetails, value: string) {
    setSetupForm((current) => current ? { ...current, [field]: value } : current);
    setSetupErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function startOnboarding() {
    if (!setupCenter || !setupForm) return;
    const validation = normalizeStripeConnectSetupInput(setupForm, setupCenter);
    if (!validation.ok) {
      setSetupErrors(validation.errors);
      setSetupMessage("Complete the required payout setup fields before opening the secure payout handoff.");
      return;
    }

    setBusyCenterId(setupCenter.id);
    setMessage(null);
    setSetupMessage(null);
    try {
      const response = await fetch("/api/billing/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId: setupCenter.id, setup: validation.details }),
      });
      const json = await response.json();
      if (response.ok && json.ok && json.saved && !json.url) {
        const savedAt = new Date().toISOString();
        setLocalCenters((current) => current.map((center) => {
          if (center.id !== setupCenter.id) return center;
          return {
            ...center,
            email: validation.details.payoutContactEmail || center.email,
            phone: validation.details.payoutContactPhone || center.phone,
            address: validation.details.addressLine1 || center.address,
            city: validation.details.city || center.city,
            state: validation.details.state || center.state,
            postalCode: validation.details.postalCode || center.postalCode,
            customFields: {
              ...fields(center.customFields),
              stripeConnectSetup: validation.details,
              stripeConnectSetupUpdatedAt: savedAt,
              stripeConnectSetupVersion: "2026-06-dashboard-v1",
            },
          };
        }));
        setMessage(json.message || "Payout setup profile saved.");
        closeSetupDialog();
        setBusyCenterId(null);
        return;
      }
      if (!response.ok || !json.ok || !json.url) {
        const serverErrors = setupErrorsFromResponse(json.fields);
        if (Object.keys(serverErrors).length) setSetupErrors(serverErrors);
        throw new Error(json.error || "Payout onboarding could not be started.");
      }
      window.location.href = json.url as string;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Payout onboarding could not be started.";
      setSetupMessage(errorMessage);
      setMessage(errorMessage);
      setBusyCenterId(null);
    }
  }

  async function startSoftwarePaymentSetup(centerId: string, method: "ach" | "card" | "default") {
    setBusyCenterId(centerId);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/software-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, method }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.url) throw new Error(json.error || "Software payment setup could not be opened.");
      window.location.assign(json.url as string);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Software payment setup could not be opened.");
      setBusyCenterId(null);
    }
  }

  async function openPayoutBankSelection(center: StripeConnectCenter) {
    if (payoutWindowRef.current && !payoutWindowRef.current.closed) {
      payoutWindowRef.current.close();
    }

    const windowName = `stripe-payout-${center.id}-${Date.now()}`;
    const stripeWindow = window.open("about:blank", windowName);
    if (!stripeWindow) {
      setMessage("Allow pop-ups for The BEE Suite, then choose the payout bank again.");
      return;
    }
    stripeWindow.opener = null;
    payoutWindowRef.current = stripeWindow;
    stripeWindow.document.title = `Opening payout setup for ${center.name}`;
    stripeWindow.document.body.textContent = `Opening a fresh secure payout setup for ${center.name}...`;

    setBusyCenterId(center.id);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect/payout-account", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ centerId: center.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.url) {
        throw new Error(json.error || "Secure payout settings could not be opened.");
      }
      if (json.centerId !== center.id) {
        throw new Error("Payout setup returned the wrong school. Close the window and try again.");
      }
      stripeWindow.location.replace(json.url as string);
      setMessage(
        json.mode === "onboarding"
          ? `A fresh one-time payout onboarding session opened for ${center.name}. Enter this school's exact routing and account numbers, or select Skip for now and return later.`
          : `A fresh account-specific payout session opened for ${center.name}. Enter or confirm this location's payout bank, then return here and select Check.`,
      );
    } catch (error) {
      stripeWindow.close();
      payoutWindowRef.current = null;
      setMessage(error instanceof Error ? error.message : "Secure payout settings could not be opened.");
    } finally {
      setBusyCenterId(null);
    }
  }

  const syncStatus = useCallback(async (centerId: string) => {
    setBusyCenterId(centerId);
    setMessage(null);
    try {
      const response = await fetch(`/api/billing/connect/status?centerId=${encodeURIComponent(centerId)}`);
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Payout status could not be checked.");
      }
      if (json.account) {
        setLocalCenters((current) => current.map((center) => {
          if (center.id !== centerId) return center;
          const custom = fields(center.customFields);
          const readiness = fields(json.readiness);
          return {
            ...center,
            customFields: {
              ...custom,
              stripeConnectAccountId: json.account.id,
              stripeChargesEnabled: json.account.chargesEnabled,
              stripePayoutsEnabled: json.account.payoutsEnabled,
              stripeDetailsSubmitted: json.account.detailsSubmitted,
              stripeMerchantCapabilityStatus: json.account.merchantCapabilityStatus,
              stripeRecipientTransferStatus: json.account.recipientTransferStatus,
              stripePayoutRequirementFields: json.account.requirementFields,
              stripePayoutStatus: text(readiness.status) || json.status,
              stripeConnectLastSyncedAt: new Date().toISOString(),
              stripePayoutBankName: json.payoutBank?.bankName ?? null,
              stripePayoutBankLast4: json.payoutBank?.last4 ?? null,
              stripePayoutBankStatus: json.payoutBank?.status ?? null,
              stripePayoutBankCurrency: json.payoutBank?.currency ?? null,
              stripePayoutBankDefaultConfirmed: json.payoutBank?.defaultForCurrency === true,
              stripePayoutBankCount: json.payoutBankCount ?? 0,
              stripePayoutBankLastSyncedAt: new Date().toISOString(),
            },
          };
        }));
      }
      setMessage(
        json.payoutBankError
          ? `Payout status updated, but the bank destination could not be confirmed: ${json.payoutBankError}`
          : json.payoutBank?.last4
            ? `Payout status updated. ${json.payoutBank.bankName || "Bank account"} ending ${json.payoutBank.last4} is selected for this school.`
            : "Payout status updated. Choose and confirm a payout bank for this school.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout status could not be checked.");
    } finally {
      setBusyCenterId(null);
    }
  }, []);

  useEffect(() => {
    const stripeConnectStatus = searchParams.get("stripeConnect");
    const centerId = searchParams.get("center");
    if (stripeConnectStatus === "return" && centerId && stripeConfigured) {
      const timer = window.setTimeout(() => void syncStatus(centerId), 0);
      return () => window.clearTimeout(timer);
    }

    const messages: Record<string, string> = {
      forbidden: "You do not have access to refresh that payout onboarding link.",
      not_found: "That school payout profile could not be found.",
      not_started: "Start payout setup before refreshing an onboarding link.",
      refresh_failed: "The processor could not refresh the onboarding link. Try again from the payout account table.",
      stripe_missing: "Payment processor keys are missing, so payout onboarding links cannot be generated yet.",
    };
    if (stripeConnectStatus && messages[stripeConnectStatus]) {
      const timer = window.setTimeout(() => setMessage(messages[stripeConnectStatus]), 0);
      return () => window.clearTimeout(timer);
    }
    const softwarePayment = searchParams.get("softwarePayment");
    if (softwarePayment === "success") {
      const timer = window.setTimeout(() => setMessage("Software payment method authorized. The payment processor is confirming it as the school's default method."), 0);
      return () => window.clearTimeout(timer);
    }
    if (softwarePayment === "cancelled") {
      const timer = window.setTimeout(() => setMessage("Software payment method setup was cancelled. The payout account was not changed."), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [searchParams, stripeConfigured, syncStatus]);

  const setupBusy = Boolean(setupCenter && busyCenterId === setupCenter.id);
  const setupDialogTitle = setupCenter ? `The BEE Suite payout setup for ${setupCenter.name}` : "The BEE Suite payout setup";
  const setupAccountLabel = setupCenter ? maskedAccount(setupCenter) : "Not connected";

  function setupFieldError(field: keyof StripeConnectSetupDetails) {
    const error = setupErrors[field];
    return error ? <p className="text-xs text-destructive">{error}</p> : null;
  }

  function setupInput(
    field: keyof StripeConnectSetupDetails,
    label: string,
    inputProps: { type?: string; placeholder?: string; autoComplete?: string; maxLength?: number } = {},
  ) {
    if (!setupForm) return null;
    const inputId = `stripe-connect-${field}`;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        <Input
          id={inputId}
          value={setupForm[field]}
          onChange={(event) => updateSetupField(field, event.target.value)}
          aria-invalid={Boolean(setupErrors[field])}
          disabled={setupBusy}
          {...inputProps}
        />
        {setupFieldError(field)}
      </div>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge className="mb-3">
              <BadgeDollarSign data-icon="inline-start" />
              Payout setup
            </Badge>
            <CardTitle>School payout accounts</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              The BEE Suite platform account can collect parent payments and route funds to each school&apos;s connected payout account.
            </CardDescription>
          </div>
          <div className="rounded-xl border bg-background/50 p-3 text-sm">
            <div className="font-medium">Parent card recovery</div>
            <div className="text-2xl font-semibold">
              {parentProcessingRecoveryApproved ? `${percentFromBps(parentSurchargeBps)}${centsLabel(parentSurchargeFixedCents)}` : "Review required"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {parentProcessingRecoveryApproved
                ? "Only added above tuition for approved higher-cost methods"
                : "Parent-paid recovery stays at $0 until legal/accounting approval is enabled"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-sm text-muted-foreground">Processor keys</div>
            <div className="mt-1 font-semibold">{stripeConfigured ? "Configured" : "Missing"}</div>
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-sm text-muted-foreground">Webhook</div>
            <div className="mt-1 font-semibold">{webhookConfigured ? "Configured" : "Missing"}</div>
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-sm text-muted-foreground">Ready schools</div>
            <div className="mt-1 font-semibold">{stats.ready}</div>
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-sm text-muted-foreground">Started</div>
            <div className="mt-1 font-semibold">{stats.started}</div>
          </div>
          <div className="rounded-xl border bg-background/40 p-4">
            <div className="text-sm text-muted-foreground">Needs setup</div>
            <div className="mt-1 font-semibold">{stats.needsSetup}</div>
          </div>
        </div>

        {!stripeConfigured ? (
          <div className="flex gap-3 rounded-xl border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-800">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            Add the platform payment processor secret key and webhook secret in Vercel before creating school payout onboarding links.
          </div>
        ) : null}
        {stripeConfigured && !webhookConfigured ? (
          <div className="flex gap-3 rounded-xl border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-800">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            Add the payment processor webhook signing secret before enabling live parent payments. Payment handoffs are blocked without webhook reconciliation unless the explicit override is enabled.
          </div>
        ) : null}

        {message ? <div className="rounded-xl border bg-background/50 p-3 text-sm text-muted-foreground">{message}</div> : null}
        <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
          <Landmark className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>
            Open one school at a time and enter the exact routing and account numbers for that location. This avoids the shared bank-login selector reusing the wrong account. You may select Skip for now and return later; bank setup never blocks login to The BEE Suite. After connecting a bank, select Check to confirm its name and last four digits.
          </span>
        </div>

        <Dialog open={Boolean(setupCenterId)} onOpenChange={(open) => {
          if (!open && !setupBusy) closeSetupDialog();
        }}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{setupDialogTitle}</DialogTitle>
              <DialogDescription>
                Review the selected school and its designated connected payout account before the secure handoff.
              </DialogDescription>
            </DialogHeader>
            {setupForm ? (
              <form className="space-y-4" onSubmit={(event) => {
                event.preventDefault();
                void startOnboarding();
              }}>
                <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-6 text-muted-foreground">
                  <BadgeDollarSign className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Executives and authorized school administrators stay inside The BEE Suite until the final required verification step. The hosted handoff may show processor-required branding, disclosures, identity prompts, and bank-account fields.
                  </span>
                </div>
                <div className="rounded-lg border bg-background/50 p-3 text-sm leading-6">
                  <div className="font-medium">{setupCenter?.name}</div>
                  <div className="text-muted-foreground">
                    {setupAccountLabel === "Not connected"
                      ? "No account is mapped yet. Continuing creates this school's designated connected account and binds onboarding to it."
                      : `Designated account: ${setupAccountLabel}. Continuing updates only this mapped account; it does not switch the school to another account.`}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {setupInput("legalBusinessName", "Legal business name", { autoComplete: "organization" })}
                  {setupInput("displayName", "Statement display / DBA name", { autoComplete: "organization" })}
                  {setupInput("payoutContactName", "Payout contact name", { autoComplete: "name" })}
                  {setupInput("payoutContactEmail", "Payout contact email", { type: "email", autoComplete: "email" })}
                  {setupInput("payoutContactPhone", "Payout contact phone", { type: "tel", autoComplete: "tel" })}
                  {setupInput("supportEmail", "Public support email", { type: "email", autoComplete: "email" })}
                  {setupInput("supportPhone", "Public support phone", { type: "tel", autoComplete: "tel" })}
                  {setupInput("businessUrl", "Business website", { type: "url", placeholder: "https://example.com" })}
                </div>

                <div className="grid gap-3 md:grid-cols-[1fr_6rem_8rem]">
                  <div className="md:col-span-3">
                    {setupInput("addressLine1", "Business address", { autoComplete: "address-line1" })}
                  </div>
                  <div className="md:col-span-3">
                    {setupInput("addressLine2", "Address line 2", { autoComplete: "address-line2" })}
                  </div>
                  {setupInput("city", "City", { autoComplete: "address-level2" })}
                  {setupInput("state", "State", { autoComplete: "address-level1", maxLength: 2 })}
                  {setupInput("postalCode", "ZIP", { autoComplete: "postal-code" })}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stripe-connect-product-description">Products and services</Label>
                  <Textarea
                    id="stripe-connect-product-description"
                    value={setupForm.productDescription}
                    onChange={(event) => updateSetupField("productDescription", event.target.value)}
                    aria-invalid={Boolean(setupErrors.productDescription)}
                    disabled={setupBusy}
                    maxLength={240}
                  />
                  {setupFieldError("productDescription")}
                </div>

                <div className="flex gap-3 rounded-lg border bg-background/50 p-3 text-sm leading-6 text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Bank account, routing details, representative identity, tax ID, and verification documents are entered only on the secure processor-hosted onboarding screen.
                  </span>
                </div>

                {setupMessage ? (
                  <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm leading-6 text-destructive">
                    {setupMessage}
                  </div>
                ) : null}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeSetupDialog} disabled={setupBusy}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={setupBusy}>
                    {setupBusy ? "Saving..." : stripeConfigured ? "Continue Secure Payout Setup" : "Save Bee Suite Profile"}
                    <ArrowUpRight data-icon="inline-end" />
                  </Button>
                </DialogFooter>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Location ID</TableHead>
              <TableHead>Payout contact</TableHead>
              <TableHead>Payout destination</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requirements</TableHead>
              <TableHead>BEE Suite fee method (not payouts)</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localCenters.map((center) => {
              const readiness = stripeConnectReadinessFromFields(center.customFields);
              const status = statusLabel(center);
              const hasAccount = maskedAccount(center) !== "Not connected";
              const centerFields = fields(center.customFields);
              const softwareMethodType = text(centerFields.stripeSoftwarePaymentMethodType);
              const softwareLast4 = text(centerFields.stripeSoftwarePaymentMethodLast4);
              const hasConfirmedPayoutBank = Boolean(text(centerFields.stripePayoutBankLast4));
              const softwareMethodLabel = softwareMethodType === "us_bank_account"
                ? `${text(centerFields.stripeSoftwarePaymentMethodBankName) || "Bank account"}${softwareLast4 ? ` •••• ${softwareLast4}` : ""}`
                : softwareMethodType === "card"
                  ? `${text(centerFields.stripeSoftwarePaymentMethodBrand) || "Card"}${softwareLast4 ? ` •••• ${softwareLast4}` : ""}`
                  : hasConfirmedPayoutBank
                    ? "Separate authorization required for BEE Suite fees"
                    : hasAccount
                      ? "Complete payout bank first"
                      : "Add after payout setup";
              return (
                <TableRow key={center.id}>
                  <TableCell className="font-medium">{center.name}</TableCell>
                  <TableCell>{center.crmLocationId ?? "Not mapped"}</TableCell>
                  <TableCell>{center.email ?? "Add school email"}</TableCell>
                  <TableCell className="max-w-48 whitespace-normal">
                    <div className="text-xs font-medium">{payoutBankLabel(center)}</div>
                    {hasAccount ? <div className="mt-1 text-[11px] text-muted-foreground">{maskedAccount(center)}</div> : null}
                  </TableCell>
                  <TableCell><Badge variant={statusVariant(status)}>{status}</Badge></TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-xs text-muted-foreground">
                    {readiness.requirementFields.length
                      ? readiness.requirementFields.slice(0, 4).join(", ")
                      : readiness.canAcceptParentPayments
                        ? "Parent payments enabled"
                        : readiness.blockingReason || "Awaiting payout status"}
                    {readiness.requirementFields.length > 4 ? ` +${readiness.requirementFields.length - 4} more` : ""}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal">
                    <div className="text-xs font-medium">{softwareMethodLabel}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="outline" disabled={busyCenterId === center.id || !stripeConfigured || !hasConfirmedPayoutBank} onClick={() => startSoftwarePaymentSetup(center.id, "ach")}>
                        <BadgeDollarSign data-icon="inline-start" />
                        {softwareMethodType ? "Change fee bank" : hasConfirmedPayoutBank ? "Authorize fee bank" : "Available after payout bank"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={busyCenterId === center.id || !stripeConfigured} onClick={() => startSoftwarePaymentSetup(center.id, "card")}>
                        <CreditCard data-icon="inline-start" />
                        {softwareMethodType ? "Change" : "Add card"}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {hasAccount ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => openPayoutBankSelection(center)}
                          disabled={busyCenterId === center.id || !stripeConfigured}
                        >
                          <Landmark data-icon="inline-start" />
                          {hasConfirmedPayoutBank ? "Change payout bank" : "Connect payout bank"}
                        </Button>
                      ) : null}
                      {hasAccount ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => syncStatus(center.id)}
                          disabled={busyCenterId === center.id || !stripeConfigured}
                        >
                          <RefreshCw data-icon="inline-start" />
                          Check
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant={hasAccount ? "outline" : "default"}
                        onClick={() => openSetupDialog(center)}
                        disabled={busyCenterId === center.id}
                      >
                        {hasAccount ? "Requirements" : "Set up"}
                        <ArrowUpRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!localCenters.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">No centers are visible for this workspace.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <div className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
          Parent payments are blocked until the designated school account has submitted its required details, has no outstanding requirements, and Stripe reports both charges and payouts enabled. Stripe Dashboard links are account-specific and should only be opened from this authenticated Bee Suite screen.
        </div>
        <div className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          <CreditCard className="mt-0.5 size-5 shrink-0 text-primary" />
          <span>
            The payout bank is the preferred software-fee method after payout onboarding. Stripe requires the school to authorize a separate ACH mandate before that bank can be charged. This does not alter the payout destination. Directors can replace the default with another bank account or card at any time from this table.
          </span>
        </div>
        <div className="rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          Fee behavior: the tuition invoice remains the family ledger amount. ACH is the default low-cost payment path. Any configured parent card processing recovery is added as a separate payment line item and included in the processor application fee so the school payout is not reduced by parent-selected card costs. {PAYMENT_PROCESSING_RECOVERY_DISCLOSURE} {PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE}
        </div>
        {!parentProcessingRecoveryApproved ? (
          <div className="flex gap-3 rounded-xl border border-amber-300/40 bg-amber-50 p-4 text-sm leading-6 text-slate-800">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            Parent-paid processing recovery is currently blocked by the legal/accounting approval gate. Set `STRIPE_PARENT_PROCESSING_RECOVERY_APPROVED=true` only after the approved policy, disclosures, refund/dispute treatment, and state/card-network review are complete.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
