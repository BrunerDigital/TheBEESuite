"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  centerId: string;
  schoolName: string;
  initialStatus: string;
  returning: boolean;
  returnToCorporatePortfolio?: boolean;
};

const CORPORATE_PORTFOLIO_PATH = "/stripe-reauthorization/corporate";

export function StripeReauthorizationCard({
  centerId,
  schoolName,
  initialStatus,
  returning,
  returnToCorporatePortfolio = false,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncStatus() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/billing/connect/migration?centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "The new Stripe account could not be checked.");
      setStatus(json.status);
      if (returnToCorporatePortfolio && (json.status === "ready_for_cutover" || json.status === "cutover_complete")) {
        window.location.assign(CORPORATE_PORTFOLIO_PATH);
        return;
      }
      setMessage(json.status === "balance_authorization_required"
        ? "Business and payout reauthorization is complete. Authorize the $99 monthly BEE Suite fee from the new Stripe balance to finish readiness."
        : json.status === "ready_for_cutover"
          ? "Thank you. This school is fully authorized and ready for a controlled cutover."
          : "Stripe saved your progress. Complete any remaining requested fields to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The new Stripe account could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!returning) return;
    const timeoutId = window.setTimeout(() => void syncStatus(), 0);
    return () => window.clearTimeout(timeoutId);
    // The return flag intentionally controls this one-time provider refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

  async function startReauthorization() {
    if (!authorized) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, authorizedRepresentative: true, returnToCorporatePortfolio }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok || !json.url) throw new Error(json.error || "Secure Stripe reauthorization could not be opened.");
      window.location.assign(json.url as string);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Secure Stripe reauthorization could not be opened.");
      setBusy(false);
    }
  }

  async function authorizeBalanceFee() {
    if (!authorized) return;
    const confirmed = window.confirm("You authorize The BEE Suite to debit this school's new Stripe account balance for the $99 monthly recurring software fee after migration cutover. This does not change the payout bank.");
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/software-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, method: "stripe_balance", approved: true }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "The BEE Suite balance authorization could not be recorded.");
      setStatus("ready_for_cutover");
      if (returnToCorporatePortfolio) {
        window.location.assign(CORPORATE_PORTFOLIO_PATH);
        return;
      }
      setMessage(json.message || "Thank you. This school is ready for a controlled cutover.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The BEE Suite balance authorization could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  const complete = status === "ready_for_cutover" || status === "cutover_complete";
  const needsBalanceAuthorization = status === "balance_authorization_required";

  return (
    <div className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div><strong>Selected school:</strong> {schoolName}. Confirm this is the business you are authorized to represent.</div>
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-6">
        <input
          type="checkbox"
          checked={authorized}
          onChange={(event) => setAuthorized(event.target.checked)}
          className="mt-1 size-4 rounded border-slate-300 accent-amber-500"
        />
        <span>I confirm that I am authorized to act for this school and provide or confirm its business, representative, tax, and payout information.</span>
      </label>

      {message ? <div role="status" className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm leading-6">{message}</div> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {complete ? (
          <div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="size-5" /> Authorization complete</div>
        ) : needsBalanceAuthorization ? (
          <Button type="button" size="lg" disabled={!authorized || busy} onClick={() => void authorizeBalanceFee()}>
            {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            Authorize $99 balance fee
          </Button>
        ) : (
          <Button type="button" size="lg" disabled={!authorized || busy} onClick={() => void startReauthorization()}>
            {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            Continue to secure Stripe setup
            {!busy ? <ArrowUpRight data-icon="inline-end" /> : null}
          </Button>
        )}
        {!complete ? <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => void syncStatus()}>Check saved progress</Button> : null}
        {returnToCorporatePortfolio && !busy ? (
          <Button type="button" size="lg" variant="outline" onClick={() => window.location.assign(CORPORATE_PORTFOLIO_PATH)}>
            Corporate school progress
          </Button>
        ) : null}
      </div>
    </div>
  );
}
