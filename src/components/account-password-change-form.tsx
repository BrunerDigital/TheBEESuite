"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { ClientAuthForm } from "@/components/client-auth-form";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { submitAccountPasswordChange } from "@/lib/account-password-change";

export function AccountPasswordChangeForm() {
  const id = useId();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    submitting.current = true; setBusy(true); setError(""); setSaved(false);
    try {
      const result = await submitAccountPasswordChange({
        currentPassword: String(values.get("currentPassword") ?? ""),
        password: String(values.get("newPassword") ?? ""),
        confirmPassword: String(values.get("confirmPassword") ?? ""),
      });
      if (result.ok) { form.reset(); setSaved(true); }
      else setError(result.error ?? "Password could not be updated.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border p-4" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`} className="text-lg font-semibold">Change your password</h2>
    <p className="text-sm text-muted-foreground">Enter your current password and choose a new one. You don’t need a reset-email link.</p>
    <ClientAuthForm action="/api/profile/password" onSubmit={submit} aria-busy={busy}>
      <Label htmlFor={`${id}-current`}>Current password</Label>
      <PasswordInput id={`${id}-current`} name="currentPassword" autoComplete="current-password" required disabled={busy} />
      <Label htmlFor={`${id}-new`}>New password</Label>
      <PasswordInput id={`${id}-new`} name="newPassword" autoComplete="new-password" minLength={8} required disabled={busy} />
      <Label htmlFor={`${id}-confirm`}>Confirm new password</Label>
      <PasswordInput id={`${id}-confirm`} name="confirmPassword" autoComplete="new-password" minLength={8} required disabled={busy} />
      <Button type="submit" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm">Password updated. Other sessions will need to sign in again.</p> : null}
    </ClientAuthForm>
  </section>;
}
