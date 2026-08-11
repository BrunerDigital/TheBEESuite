"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginHrefForNextPath, safeLoginNextPath } from "@/lib/login-routing";
import {
  hasPasswordRecoveryContext,
  MISSING_PASSWORD_RECOVERY_LINK_MESSAGE,
  passwordRecoveryUrlWithoutSecrets,
  resolvePasswordRecoveryLink,
  type PasswordRecoveryCredential,
  type PasswordRecoveryLinkResolution,
} from "@/lib/password-recovery-url";

type ResetResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function safeNextPath(value: string | null) {
  return safeLoginNextPath(value, "/dashboard");
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const forceReset = searchParams.get("force") === "1";
  const next = safeNextPath(searchParams.get("next"));
  const parentPortalFlow = next === "/parent-portal" || next.startsWith("/parent-portal/");
  const parentSetupFlow = next === "/parent-portal/setup";
  const freshResetHref = `/forgot-password?next=${encodeURIComponent(next)}`;
  const credentialRef = useRef<PasswordRecoveryCredential>({});
  const recoveryResolutionRef = useRef<PasswordRecoveryLinkResolution | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [linkStatus, setLinkStatus] = useState<"checking" | "ready" | "invalid">(forceReset ? "ready" : "checking");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (forceReset) return;

    let active = true;

    function resolveCurrentRecoveryState() {
      const currentSearch = window.location.search;
      const currentHash = window.location.hash;
      const resolution =
        hasPasswordRecoveryContext(currentSearch, currentHash) || !recoveryResolutionRef.current
          ? resolvePasswordRecoveryLink(currentSearch, currentHash)
          : recoveryResolutionRef.current;
      recoveryResolutionRef.current = resolution;

      if (resolution.status === "ready") {
        credentialRef.current = resolution.credential;
        queueMicrotask(() => {
          if (!active) return;
          setError("");
          setLinkStatus("ready");
        });
      } else {
        credentialRef.current = {};
        queueMicrotask(() => {
          if (!active) return;
          setError(resolution.message);
          setLinkStatus("invalid");
        });
      }

      const cleanUrl = passwordRecoveryUrlWithoutSecrets(window.location.href);
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (cleanUrl !== currentUrl) window.history.replaceState(null, "", cleanUrl);
    }

    resolveCurrentRecoveryState();
    window.addEventListener("hashchange", resolveCurrentRecoveryState);

    return () => {
      active = false;
      window.removeEventListener("hashchange", resolveCurrentRecoveryState);
    };
  }, [forceReset, search]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!forceReset && !credentialRef.current.accessToken && !credentialRef.current.tokenHash) {
      setError(MISSING_PASSWORD_RECOVERY_LINK_MESSAGE);
      setLinkStatus("invalid");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Re-enter the new password in both fields.");
      return;
    }

    startTransition(async () => {
      try {
        const endpoint = forceReset ? "/api/auth/force-password-reset" : "/api/auth/reset-password";
        const credential = credentialRef.current;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(forceReset ? { currentPassword, password } : { ...credential, password }),
        });
        const data = (await response.json().catch(() => null)) as ResetResponse | null;

        if (!response.ok) {
          setError(data?.error ?? "Unable to update your password.");
          return;
        }

        setMessage(data?.message ?? (parentPortalFlow ? "Password updated. Sign in to open your parent portal." : "Password updated. You can now sign in."));
        const loginNext = `${loginHrefForNextPath(next)}&reset=complete`;
        setTimeout(() => router.push(forceReset ? next : loginNext), 1200);
      } catch {
        setError("We could not reach the password reset service. Check your connection and try again. Your entries are still here.");
      }
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white lg:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 lg:flex">
        <BrandLogo href="/" size="md" compact={parentSetupFlow} priority />
        <div className="max-w-xl">
          <div className="text-5xl font-semibold leading-tight tracking-normal" aria-hidden="true">
            {parentPortalFlow ? "Create Your Parent Portal Password" : "Create a New Password"}
          </div>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {parentPortalFlow
              ? forceReset
                ? "Choose a private password before opening your family portal."
                : parentSetupFlow
                  ? "This secure link lets you create the password for the email your school invited. After saving it, sign in and finish parent setup."
                  : "This secure link lets you create a password for the parent or guardian email your school has on file."
              : forceReset
                ? "Passwords must be updated before workspace access is allowed."
                : "This screen only works from a valid password recovery link. After updating, sign in again with your email."}
          </p>
        </div>
        <p className="text-sm text-slate-300">
          {parentPortalFlow
            ? "Use your family portal for child updates, messages, documents, billing, and check-in."
            : "Your password protects the school information connected to your account."}
        </p>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <LockKeyhole />
            </div>
            <h1 className="mt-4 text-balance text-3xl font-semibold">{parentPortalFlow ? "Set Your Parent Portal Password" : "Set a New Password"}</h1>
            <CardDescription id="reset-password-description">
              {linkStatus === "invalid"
                ? "Use the recovery link from the newest email. Older links stop working after another reset is requested."
                : linkStatus === "checking"
                  ? "Checking your secure reset link…"
                  : parentPortalFlow
                ? "Use at least 8 characters. You will use this with the email from your invite."
                : forceReset
                  ? "Enter your password, then choose something only you know."
                  : "Use at least 8 characters. Choose something only you know."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit} aria-busy={isPending} aria-describedby="reset-password-description">
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{linkStatus === "invalid" ? "Reset link unavailable" : "Password update failed"}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {message ? (
                <Alert role="status" className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {linkStatus === "checking" ? (
                <p role="status" aria-live="polite" className="py-4 text-center text-sm text-slate-600">Checking reset link…</p>
              ) : null}
              {linkStatus === "ready" && forceReset ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    className="h-11"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              ) : null}
              {linkStatus === "ready" ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="password">New password</Label>
                    <Input
                      id="password"
                      name="newPassword"
                      className="h-11"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      className="h-11"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <Button className="h-11" size="lg" type="submit" disabled={isPending}>
                    {isPending ? "Updating password…" : "Update password"}
                  </Button>
                </>
              ) : null}
            </form>
            {forceReset ? (
              <Link href={`${loginHrefForNextPath(next)}&reset=required`} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-slate-950 hover:underline">
                Back to sign in
              </Link>
            ) : linkStatus === "invalid" ? (
              <Link href={freshResetHref} className={buttonVariants({ size: "lg", className: "mt-5 h-11 w-full" })}>
                Request a new reset link
              </Link>
            ) : (
              <Link
                href={freshResetHref}
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-slate-950 hover:underline"
              >
                Request a new reset link
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
