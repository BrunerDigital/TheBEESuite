"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  centerId: string;
  schoolName: string;
  schoolEmail: string | null;
  initialStatus: string;
  returning: boolean;
  autoStart: boolean;
};

function statusMessage(status: string) {
  if (status === "stripe_verification_complete") {
    return "Already complete. Stripe has enabled this account and a default payout bank is present, so no new verification session was created.";
  }
  if (status === "stripe_verification_pending") {
    return "Stripe is reviewing the submitted information. No additional fields are currently due.";
  }
  if (status === "stripe_verification_blocked") {
    return "This account needs a configuration review before another verification session can be opened. No changes were made.";
  }
  if (status === "stripe_verification_error") {
    return "The Stripe verification account could not be checked. Try again in a moment.";
  }
  return "Stripe still needs information. Open the secure hosted verification session to continue.";
}

export function CorporateStripeVerificationCard({
  centerId,
  schoolName,
  schoolEmail,
  initialStatus,
  returning,
  autoStart,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    initialStatus === "stripe_verification_required" ? null : statusMessage(initialStatus),
  );
  const autoStarted = useRef(false);

  async function syncStatus() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/billing/connect/migration?centerId=${encodeURIComponent(centerId)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "The Stripe account could not be checked.");
      setStatus(json.status);
      setMessage(statusMessage(json.status));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Stripe account could not be checked.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!returning) return;
    const timeoutId = window.setTimeout(() => void syncStatus(), 0);
    return () => window.clearTimeout(timeoutId);
    // The provider return flag intentionally controls this one-time status refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

  async function startVerification() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/connect/migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId, authorizedRepresentative: true, termsAccepted: true }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Secure Stripe verification could not be opened.");
      if (!json.url && typeof json.status === "string") {
        setStatus(json.status);
        setMessage(statusMessage(json.status));
        setBusy(false);
        return;
      }
      if (!json.url) throw new Error("Secure Stripe verification could not be opened.");
      window.location.assign(json.url as string);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Secure Stripe verification could not be opened.");
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!autoStart || !termsAccepted || status !== "stripe_verification_required" || autoStarted.current) return;
    autoStarted.current = true;
    const timeoutId = window.setTimeout(() => void startVerification(), 0);
    return () => window.clearTimeout(timeoutId);
    // The authenticated, server-allowlisted page controls this one-time hosted handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, status, termsAccepted]);

  const complete = status === "stripe_verification_complete";
  const pending = status === "stripe_verification_pending";
  const blocked = status === "stripe_verification_blocked" || status === "stripe_verification_error";

  return (
    <div className="rounded-3xl border border-white/10 bg-white p-6 text-slate-900 shadow-2xl sm:p-8">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-700" />
        <div><strong>Selected school:</strong> {schoolName}. This page is pinned to the approved Stripe account for this location.</div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <strong>This school&apos;s Stripe account already exists.</strong> On Stripe&apos;s page, sign in with <span className="break-all font-semibold">{schoolEmail || "the school email on file"}</span> and the existing Stripe password. If no Stripe password was created, choose Stripe&apos;s create-account or password-setup option for that same email. The BEE Suite never receives or stores the Stripe password.
      </div>

      <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm leading-6">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-1 size-4 rounded border-slate-300 accent-amber-500"
        />
        <span>I agree to the terms of service and confirm that I am authorized to act for this school. Stripe will collect the bank information and final Stripe attestation in its secure hosted flow.</span>
      </label>

      {message ? <div role="status" className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm leading-6">{message}</div> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {complete ? (
          <div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="size-5" /> Already complete</div>
        ) : pending ? (
          <div className="flex items-center gap-2 font-semibold text-blue-700"><ShieldCheck className="size-5" /> Stripe review in progress</div>
        ) : blocked ? (
          <div className="flex items-center gap-2 font-semibold text-amber-700"><TriangleAlert className="size-5" /> Verification session unavailable</div>
        ) : (
          <Button type="button" size="lg" disabled={!termsAccepted || busy} onClick={() => void startVerification()}>
            {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            Continue to Stripe sign in or setup
            {!busy ? <ArrowUpRight data-icon="inline-end" /> : null}
          </Button>
        )}
        {!complete ? <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => void syncStatus()}>Check Stripe status</Button> : null}
        {!busy ? (
          <Button type="button" size="lg" variant="outline" onClick={() => window.location.assign("/stripe-reauthorization/corporate")}>
            Corporate school progress
          </Button>
        ) : null}
      </div>
    </div>
  );
}
