"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, BadgeDollarSign, CheckCircle2, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
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
  tuitionFeatureFeeBps: number;
  parentProcessingRecoveryApproved: boolean;
  parentSurchargeBps: number;
  tuitionFeatureFeeFixedCents: number;
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
  tuitionFeatureFeeBps,
  parentProcessingRecoveryApproved,
  parentSurchargeBps,
  tuitionFeatureFeeFixedCents,
  parentSurchargeFixedCents,
}: StripeConnectPanelProps) {
  const searchParams = useSearchParams();
  const [busyCenterId, setBusyCenterId] = useState<string | null>(null);
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
            },
          };
        }));
      }
      setMessage("Payout status updated.");
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
    return undefined;
  }, [searchParams, stripeConfigured, syncStatus]);

  const setupBusy = Boolean(setupCenter && busyCenterId === setupCenter.id);
  const setupDialogTitle = setupCenter ? `The BEE Suite payout setup for ${setupCenter.name}` : "The BEE Suite payout setup";

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
              The BEE Suite platform account can collect parent payments, retain the configured school-paid tuition payments feature fee, and route the remaining funds to each school&apos;s connected payout account.
            </CardDescription>
          </div>
          <div className="rounded-xl border bg-background/50 p-3 text-sm">
            <div className="font-medium">Tuition feature fee</div>
            <div className="text-2xl font-semibold">{percentFromBps(tuitionFeatureFeeBps)}{centsLabel(tuitionFeatureFeeFixedCents)}</div>
            <div className="mt-1 text-xs text-muted-foreground">School-paid BEE Suite fee retained from tuition payout</div>
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

        <Dialog open={Boolean(setupCenterId)} onOpenChange={(open) => {
          if (!open && !setupBusy) closeSetupDialog();
        }}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{setupDialogTitle}</DialogTitle>
              <DialogDescription>
                Save the school&apos;s Bee Suite payout profile before the secure processor handoff.
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
                    Directors stay inside The BEE Suite until the final required verification step. The hosted handoff may show processor-required branding, disclosures, and identity prompts.
                  </span>
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
                    {setupBusy ? "Saving..." : stripeConfigured ? "Continue Secure Setup" : "Save Bee Suite Profile"}
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
              <TableHead>Payout account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requirements</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {localCenters.map((center) => {
              const readiness = stripeConnectReadinessFromFields(center.customFields);
              const status = statusLabel(center);
              const hasAccount = maskedAccount(center) !== "Not connected";
              return (
                <TableRow key={center.id}>
                  <TableCell className="font-medium">{center.name}</TableCell>
                  <TableCell>{center.crmLocationId ?? "Not mapped"}</TableCell>
                  <TableCell>{center.email ?? "Add school email"}</TableCell>
                  <TableCell>{maskedAccount(center)}</TableCell>
                  <TableCell><Badge variant={statusVariant(status)}>{status}</Badge></TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-xs text-muted-foreground">
                    {readiness.requirementFields.length
                      ? readiness.requirementFields.slice(0, 4).join(", ")
                      : readiness.canAcceptParentPayments
                        ? "Parent payments enabled"
                        : readiness.blockingReason || "Awaiting payout status"}
                    {readiness.requirementFields.length > 4 ? ` +${readiness.requirementFields.length - 4} more` : ""}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
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
                        onClick={() => openSetupDialog(center)}
                        disabled={busyCenterId === center.id}
                      >
                        {hasAccount ? "Continue" : "Set up"}
                        <ArrowUpRight data-icon="inline-end" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!localCenters.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">No centers are visible for this workspace.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>

        <div className="flex gap-3 rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
          Parent payments are blocked for a school until its payout account exists and the processor reports that payouts are enabled. Account links are single-use and should only be opened from this authenticated Bee Suite screen.
        </div>
        <div className="rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          Fee behavior: the tuition invoice remains the family ledger amount. ACH is the default low-cost payment path. Any configured parent card processing recovery is added as a separate payment line item and included in the processor application fee so the school payout is not reduced by parent-selected card costs. The BEE Suite tuition payments feature fee is school-paid and retained from the school&apos;s tuition payout. {PAYMENT_PROCESSING_RECOVERY_DISCLOSURE} {PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE}
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
