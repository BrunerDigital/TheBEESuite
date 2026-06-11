"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, BadgeDollarSign, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PAYMENT_PROCESSING_RECOVERY_DISCLOSURE,
  PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE,
} from "@/lib/payment-disclosures";
import { stripeConnectReadinessFromFields } from "@/lib/stripe-connect-readiness";

export type StripeConnectCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  email: string | null;
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

  const stats = useMemo(() => {
    const ready = localCenters.filter((center) => statusLabel(center) === "Ready").length;
    const started = localCenters.filter((center) => maskedAccount(center) !== "Not connected").length;
    return {
      ready,
      started,
      needsSetup: Math.max(0, localCenters.length - started),
    };
  }, [localCenters]);

  async function startOnboarding(centerId: string) {
    setBusyCenterId(centerId);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.url) {
        throw new Error(json.error || "Payout onboarding could not be started.");
      }
      window.location.href = json.url as string;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payout onboarding could not be started.");
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
            Add the payment processor webhook signing secret before enabling live parent checkout. Checkout is blocked without webhook reconciliation unless the explicit override is enabled.
          </div>
        ) : null}

        {message ? <div className="rounded-xl border bg-background/50 p-3 text-sm text-muted-foreground">{message}</div> : null}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>School</TableHead>
              <TableHead>Location ID</TableHead>
              <TableHead>Payout contact</TableHead>
              <TableHead>Connected account</TableHead>
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
                        ? "Checkout enabled"
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
                        onClick={() => startOnboarding(center.id)}
                        disabled={busyCenterId === center.id || !stripeConfigured}
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
          Parent checkout is blocked for a school until its connected payout account exists and the processor reports that payouts are enabled. Account links are single-use and should only be opened from this authenticated screen.
        </div>
        <div className="rounded-xl border bg-background/40 p-4 text-sm leading-6 text-muted-foreground">
          Fee behavior: the tuition invoice remains the family ledger amount. ACH is the default low-cost payment path. Any configured parent card processing recovery is added as a separate Checkout line item and included in the processor application fee so the school payout is not reduced by parent-selected card costs. The BEE Suite tuition payments feature fee is school-paid and retained from the school&apos;s tuition payout. {PAYMENT_PROCESSING_RECOVERY_DISCLOSURE} {PAYMENT_PROCESSING_RECOVERY_REVIEW_NOTE}
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
