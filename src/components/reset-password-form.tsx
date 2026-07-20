"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginHrefForNextPath, safeLoginNextPath } from "@/lib/login-routing";

type ResetResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

type ResetCredential = {
  accessToken?: string;
  tokenHash?: string;
};

function readRecoveryTokenFromHash(): ResetCredential {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const type = params.get("type");
  const accessToken = params.get("access_token");
  return type === "recovery" && accessToken ? { accessToken } : {};
}

function readRecoveryCredential(searchParams: URLSearchParams): ResetCredential {
  const type = searchParams.get("type");
  const tokenHash = searchParams.get("token_hash") || searchParams.get("tokenHash");
  if (type === "recovery" && tokenHash) return { tokenHash };
  return readRecoveryTokenFromHash();
}

function removeRecoveryCredentialFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("tokenHash");
  url.searchParams.delete("type");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function safeNextPath(value: string | null) {
  return safeLoginNextPath(value, "/dashboard");
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceReset = searchParams.get("force") === "1";
  const next = safeNextPath(searchParams.get("next"));
  const parentPortalFlow = next === "/parent-portal" || next.startsWith("/parent-portal/");
  const parentSetupFlow = next === "/parent-portal/setup";
  const credentialRef = useRef<ResetCredential>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (forceReset) return;
    const credential = readRecoveryCredential(new URLSearchParams(searchParams.toString()));
    if (credential.accessToken || credential.tokenHash) {
      credentialRef.current = credential;
      removeRecoveryCredentialFromUrl();
    }
  }, [forceReset, searchParams]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!forceReset && !credentialRef.current.accessToken && !credentialRef.current.tokenHash) {
      setError("This reset link is missing or expired. Request a fresh password reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
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
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">
            {parentPortalFlow ? "Create your parent portal password." : "Create a new secure password."}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {parentPortalFlow
              ? forceReset
                ? "Choose a private password before opening your family portal."
                : parentSetupFlow
                  ? "This secure link lets you create the password for the email your school invited. After saving it, sign in and finish parent setup."
                  : "This secure link lets you create a password for the parent or guardian email your school has on file."
              : forceReset
                ? "Passwords must be updated before workspace access is allowed."
                : "This screen only works from a valid Supabase recovery link. After updating, sign in again with your email."}
          </p>
        </div>
        <p className="text-sm text-slate-300">
          {parentPortalFlow
            ? "Your family portal keeps child updates, messages, documents, billing, and check-in access in one place."
            : "Human review remains required for sensitive child, billing, and compliance workflows."}
        </p>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <LockKeyhole />
            </div>
            <CardTitle className="mt-4 text-3xl">{parentPortalFlow ? "Set your parent portal password" : "Set a new password"}</CardTitle>
            <CardDescription>
              {parentPortalFlow
                ? "Use at least 8 characters. You will use this with the email from your invite."
                : forceReset
                  ? "Enter your password, then choose something only you know."
                  : "Use at least 8 characters. Choose something only you know."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Password update failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {message ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {forceReset ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="currentPassword">Current password</Label>
                  <Input
                    id="currentPassword"
                    className="h-11"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
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
                {isPending ? "Updating password..." : "Update password"}
              </Button>
            </form>
            {forceReset ? (
              <Link href={`${loginHrefForNextPath(next)}&reset=required`} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-slate-950 hover:underline">
                Back to login
              </Link>
            ) : (
              <Link
                href={parentPortalFlow ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password"}
                className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-slate-950 hover:underline"
              >
                Request a fresh reset link
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
