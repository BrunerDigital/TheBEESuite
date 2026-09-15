"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManagedMfaFactor, MfaManagementResult } from "@/lib/mfa-management";

export function MfaSettings({ required }: { required: boolean }) {
  const [password, setPassword] = useState("");
  const [factors, setFactors] = useState<ManagedMfaFactor[] | null>(null);
  const [currentFactorId, setCurrentFactorId] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [label, setLabel] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<MfaManagementResult["enrollment"]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const verified = factors?.filter((factor) => factor.verified) ?? [];

  async function submit(action: "list" | "enroll" | "confirm" | "remove", targetId?: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/mfa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password, currentFactorId, currentCode, label, factorId: targetId ?? factorId, code }),
      });
      const result = await response.json() as MfaManagementResult;
      setCurrentCode("");
      setCode("");
      if (result.factors) {
        setFactors(result.factors);
        setCurrentFactorId(result.factors.find((factor) => factor.verified)?.id ?? "");
      }
      if (result.enrollment) { setEnrollment(result.enrollment); setFactorId(result.enrollment.id); }
      if (result.signInRequired) {
        setSignInRequired(true); setPassword(""); setEnrollment(undefined); setFactors(null);
        setMessage(result.ok ? "Your security change is complete. Sign in again with your authenticator. Other BEE sessions have been signed out." : result.error ?? "Sign in again to check your authenticators.");
      } else setMessage(result.error ?? (action === "list" ? "Your authenticators are shown below." : "Setup started. Save the setup key in your authenticator, then verify its code."));
    } catch {
      if (action === "confirm" || action === "remove") { setSignInRequired(true); setPassword(""); setEnrollment(undefined); setFactors(null); }
      setMessage("We could not reach account security. Try again. If you were confirming or removing an authenticator, sign in again to check its status.");
    }
    finally { setBusy(false); }
  }
  function onSubmit(event: FormEvent) { event.preventDefault(); void submit("list"); }

  return <section className="space-y-5 rounded-xl border bg-card p-5" aria-label="Authenticator settings">
    {required && <p className="font-medium">An authenticator is required for your role before you can use your workspace.</p>}
    <p className="text-sm text-muted-foreground">Add a primary authenticator and a separate backup before you lose or replace a device. You can use either at sign-in. Keep setup keys private.</p>
    {message && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{message}</p>}
    {signInRequired ? <Link className="inline-block rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground" href="/login?next=%2Faccount%2Fsecurity">Sign in again</Link> : <>
      <form method="post" onSubmit={onSubmit} className="space-y-3" aria-busy={busy}>
        <label className="block text-sm font-medium" htmlFor="security-password">Current password</label>
        <Input id="security-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
        <Button type="submit" disabled={busy || !password}>View authenticators</Button>
      </form>
      {factors && <fieldset disabled={busy} className="space-y-5">
        <legend className="mb-3 font-semibold">Your authenticators</legend>
        {factors.length === 0 ? <p className="text-sm">No authenticators are set up yet.</p> : <ul className="space-y-3">{factors.map((factor) => <li key={factor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
          <span className="min-w-0 break-words text-sm">{factor.label} <span className="text-muted-foreground">({factor.verified ? "Active" : "Setup pending"})</span></span>
          <div className="flex gap-2">{!factor.verified && <Button variant="outline" onClick={() => { setFactorId(factor.id); setEnrollment(undefined); }}>Finish setup</Button>}
            <Button variant="outline" disabled={factor.verified && verified.length < 2} onClick={() => void submit("remove", factor.id)}>{factor.verified ? "Remove" : "Cancel setup"}</Button></div>
        </li>)}</ul>}
        {verified.length > 0 && <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="existing-authenticator">Existing authenticator</label>
          <select id="existing-authenticator" value={currentFactorId} onChange={(event) => setCurrentFactorId(event.target.value)} className="w-full rounded-md border bg-background p-2">{verified.map((factor) => <option key={factor.id} value={factor.id}>{factor.label}</option>)}</select>
          <label className="block text-sm font-medium" htmlFor="existing-authenticator-code">Fresh code from this authenticator</label>
          <Input id="existing-authenticator-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={currentCode} onChange={(event) => setCurrentCode(event.target.value.replace(/\D/g, ""))} />
          <p className="text-xs text-muted-foreground">Enter a fresh code before each security change.</p>
        </div>}
        {!enrollment && <div className="space-y-2 border-t pt-4">
          <label className="block text-sm font-medium" htmlFor="authenticator-name">New authenticator name</label>
          <Input id="authenticator-name" maxLength={80} placeholder="My phone or backup device" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Button onClick={() => void submit("enroll")} disabled={!label.trim()}>Add authenticator</Button>
        </div>}
        {enrollment && <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Save your setup key</h2>
          <p className="text-sm">In your authenticator app, add a time-based account named The BEE Suite and enter this key. It is shown only during this setup.</p>
          <code className="block select-all break-all rounded bg-muted p-3 text-sm">{enrollment.secret}</code>
        </div>}
        {factorId && <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="new-authenticator-code">Code from the new authenticator</label>
          <Input id="new-authenticator-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          <p className="text-xs text-muted-foreground">Verification signs out your BEE sessions, including this one. If the code expires, sign in again and finish the pending setup.</p>
          <Button onClick={() => void submit("confirm")} disabled={code.length !== 6}>Verify and finish setup</Button>
        </div>}
      </fieldset>}
    </>}
    <div className="border-t pt-4 text-sm"><h2 className="font-semibold">Lost your authenticator?</h2>
      <p className="mt-2 text-muted-foreground">Choose your backup authenticator at sign-in. If you have lost all authenticators, contact your administrator through your established support channel for identity-verified recovery. A password reset does not remove MFA.</p>
    </div>
  </section>;
}
